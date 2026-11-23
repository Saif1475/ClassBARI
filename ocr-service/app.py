"""Handwriting-to-text service for Instanton Campus.

POST /handwriting  (multipart field "file": a photo of handwritten notes)
  -> {"lines": [...], "text": "..."}
POST /embed        {"texts": ["..."]} -> {"vectors": [[...384 numbers...]], "model": "..."}
                   (AI chat: finds a question asked before, in English or Bangla, to reuse its saved answer)
POST /moderate     (multipart field "file": a photo) -> {"nsfw": 0.02, "model": "..."}
                   (community: how likely the photo is nudity or sexual, 0 to 1; the website decides what to hold back)
GET  /health       -> {"ok": true, "model": "..."}

Pipeline: fix phone rotation -> split the page into text lines (OpenCV) -> read each line with
TrOCR (handwriting model, English). Runs on CPU. Bangla needs a Bangla-trained model later (OCR_MODEL).
"""

import io
import os

import cv2
import numpy as np
import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel
from PIL import Image, ImageOps, UnidentifiedImageError

MODEL = os.environ.get("OCR_MODEL", "microsoft/trocr-small-handwritten")
MAX_BYTES = 10 * 1024 * 1024  # 10 MB photos
MAX_LINES = 60
BATCH = 8
# Multilingual BERT sentence model (50+ languages incl. Bangla), 384 numbers per text. ~470 MB, downloaded on first /embed.
EMBED_MODEL = os.environ.get("EMBED_MODEL", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")

torch.set_num_threads(os.cpu_count() or 4)


def find_lines(gray: np.ndarray) -> list[tuple[int, int, int, int]]:
    """Return (x0, y0, x1, y1) boxes for each line of writing, top to bottom."""
    h, w = gray.shape
    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    ink = cv2.adaptiveThreshold(blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 31, 15)
    ink = cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))  # drop paper specks
    # Smear ink sideways so the letters and words of one line join into one band.
    smear = cv2.dilate(ink, cv2.getStructuringElement(cv2.MORPH_RECT, (max(15, w // 25), 3)))
    rows = smear.sum(axis=1) / 255
    on = rows > max(3, 0.02 * w)

    bands, start = [], None
    for y, filled in enumerate(on):
        if filled and start is None:
            start = y
        elif not filled and start is not None:
            bands.append([start, y])
            start = None
    if start is not None:
        bands.append([start, h])

    # Join bands split by a tiny gap (e.g. dots, accents), drop specks that are too thin to be text.
    merged: list[list[int]] = []
    for b in bands:
        if merged and b[0] - merged[-1][1] < max(3, h // 200):
            merged[-1][1] = b[1]
        else:
            merged.append(b)
    merged = [b for b in merged if b[1] - b[0] >= max(8, h // 100)]

    boxes = []
    for y0, y1 in merged[:MAX_LINES]:
        cols = np.where(ink[y0:y1].sum(axis=0) > 0)[0]
        if cols.size == 0:
            continue
        pad = (y1 - y0) // 4
        boxes.append((max(0, cols[0] - pad), max(0, y0 - pad), min(w, cols[-1] + pad), min(h, y1 + pad)))
    return boxes


def load_image(data: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img)  # phone photos are often stored sideways
    img = img.convert("RGB")
    if img.width > 1600:  # enough detail for TrOCR, much faster line finding
        img = img.resize((1600, round(img.height * 1600 / img.width)))
    return img


app = FastAPI(title="Instanton Campus handwriting OCR")
_model = None


def model():
    """Load TrOCR once (first call downloads it, ~250 MB for the small model)."""
    global _model
    if _model is None:
        from transformers import TrOCRProcessor, VisionEncoderDecoderModel

        processor = TrOCRProcessor.from_pretrained(MODEL)
        net = VisionEncoderDecoderModel.from_pretrained(MODEL).eval()
        _model = (processor, net)
    return _model


@app.on_event("startup")
def warm_up() -> None:
    model()


@app.get("/health")
def health() -> dict:
    return {"ok": True, "model": MODEL}


# Photo check for the student community: a ViT image classifier with two labels, "normal" and "nsfw". ~343 MB, on first /moderate.
IMAGE_CHECK_MODEL = os.environ.get("IMAGE_CHECK_MODEL", "Falconsai/nsfw_image_detection")
_checker = None


def checker():
    global _checker
    if _checker is None:
        from transformers import AutoImageProcessor, AutoModelForImageClassification

        net = AutoModelForImageClassification.from_pretrained(IMAGE_CHECK_MODEL).eval()
        bad = [i for i, label in net.config.id2label.items() if "nsfw" in str(label).lower() or "porn" in str(label).lower()]
        if not bad:
            raise RuntimeError(f"{IMAGE_CHECK_MODEL} has no nsfw label: {net.config.id2label}")
        _checker = (AutoImageProcessor.from_pretrained(IMAGE_CHECK_MODEL), net, bad)
    return _checker


# Plain (not async) functions: FastAPI runs them on worker threads, so one slow page of handwriting
# doesn't make every photo check and health check wait behind it.
@app.post("/moderate")
def moderate(file: UploadFile = File(...)) -> dict:
    data = file.file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "Image too large (max 10 MB)")
    try:
        img = load_image(data)
    except (UnidentifiedImageError, OSError):
        raise HTTPException(400, "Not an image")
    processor, net, bad = checker()
    with torch.inference_mode():
        probs = net(**processor(images=img, return_tensors="pt")).logits.softmax(-1)[0]
    return {"nsfw": round(float(sum(probs[i] for i in bad)), 4), "model": IMAGE_CHECK_MODEL}


_embedder = None


def embedder():
    """Load the sentence model on first use only, so the handwriting service starts without it."""
    global _embedder
    if _embedder is None:
        from transformers import AutoModel, AutoTokenizer

        _embedder = (AutoTokenizer.from_pretrained(EMBED_MODEL), AutoModel.from_pretrained(EMBED_MODEL).eval())
    return _embedder


class Texts(BaseModel):
    texts: list[str]


@app.post("/embed")
def embed(body: Texts) -> dict:
    if not 1 <= len(body.texts) <= 16 or any(len(t) > 4000 for t in body.texts):
        raise HTTPException(400, "1-16 texts of at most 4000 characters")
    tok, net = embedder()
    batch = tok(body.texts, padding=True, truncation=True, max_length=256, return_tensors="pt")
    with torch.inference_mode():
        out = net(**batch).last_hidden_state
    mask = batch["attention_mask"].unsqueeze(-1).float()
    vec = (out * mask).sum(1) / mask.sum(1).clamp(min=1e-9)  # mean of the word vectors: how this model is meant to be used
    vec = torch.nn.functional.normalize(vec, dim=1)  # length 1, so cosine similarity is a plain dot product
    return {"vectors": vec.tolist(), "model": EMBED_MODEL}


@app.post("/handwriting")
def handwriting(file: UploadFile = File(...)) -> dict:
    data = file.file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "Image too large (max 10 MB)")
    try:
        img = load_image(data)
    except (UnidentifiedImageError, OSError):
        raise HTTPException(400, "Not an image")

    boxes = find_lines(cv2.cvtColor(np.array(img), cv2.COLOR_RGB2GRAY))
    crops = [img.crop(b) for b in boxes] or [img]
    processor, net = model()
    lines: list[str] = []
    with torch.inference_mode():
        for i in range(0, len(crops), BATCH):
            pixels = processor(images=crops[i : i + BATCH], return_tensors="pt").pixel_values
            ids = net.generate(pixels, max_new_tokens=64)
            lines += [t.strip() for t in processor.batch_decode(ids, skip_special_tokens=True)]
    lines = [l for l in lines if l]
    return {"lines": lines, "text": "\n".join(lines)}

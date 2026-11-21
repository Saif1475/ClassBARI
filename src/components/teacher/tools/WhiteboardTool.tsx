"use client";

import { useEffect, useRef, useState } from "react";
import type { ToolProps } from "./ToolsPage";
import { PollLauncher } from "@/components/LivePollBanner";
import { shareBoard } from "@/components/LiveClassroom";
import { BOARD_MAX_CHARS } from "@/lib/live-class";
import { useLms } from "@/lib/lms-store";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { saveFile } from "@/lib/file-store";

type DrawTool =
  | "hand"
  | "pen"
  | "highlighter"
  | "eraser"
  | "laser"
  | "line"
  | "arrow"
  | "rect"
  | "circle"
  | "triangle"
  | "text"
  | "sticky";

type BgMode = "blank" | "grid" | "ruled" | "dots" | "chalkboard";
type ExportFormat = "png" | "jpeg" | "webp" | "avif" | "svg" | "pdf";

const COLORS = [
  { name: "Ink", hex: "#171d1b" },
  { name: "White", hex: "#ffffff" },
  { name: "Teal", hex: "#006a60" },
  { name: "Red", hex: "#ba1a1a" },
  { name: "Blue", hex: "#1d4ed8" },
  { name: "Amber", hex: "#b45309" },
  { name: "Purple", hex: "#7e22ce" },
];

const MATH_SYMBOLS = ["π", "θ", "Δ", "Σ", "∫", "√", "∞", "±", "≤", "≥", "≠", "→", "°", "Ω", "λ", "μ"];

// Infinite board: starts big, grows in any direction when you draw near an edge.
// shortcut: one bitmap, capped at ~16 million pixels (the iPhone Safari canvas limit, about 4000 × 4000);
// a truly endless board needs tiles or vector strokes.
const START = { w: 2400, h: 1600 };
const GROW = 800; // px added at a time
const EDGE = 160; // drawing this close to an edge grows the board
const MAX_AREA = 16_000_000;
const PAGE = { w: 1600, h: 1000 }; // PDF page size (each slide is fitted onto it)
type Snap = { blob: Promise<Blob | null>; ox: number; oy: number }; // compressed undo step + where the board's origin was

const loadImg = (src: string) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

/** The part of a drawing that has ink, plus a margin (so exports aren't mostly empty). */
function inkBox(src: HTMLCanvasElement) {
  const { width: w, height: h } = src;
  const data = src.getContext("2d")!.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return { x: 0, y: 0, w: Math.min(w, PAGE.w), h: Math.min(h, PAGE.h) }; // empty board
  const pad = 40;
  const x = Math.max(0, x0 - pad), y = Math.max(0, y0 - pad);
  return { x, y, w: Math.min(w, x1 + pad) - x, h: Math.min(h, y1 + pad) - y };
}

const TOOL_BUTTONS: { id: DrawTool; label: string }[] = [
  { id: "hand", label: "Move" },
  { id: "pen", label: "Pen" },
  { id: "highlighter", label: "Highlight" },
  { id: "eraser", label: "Eraser" },
  { id: "laser", label: "Laser" },
  { id: "line", label: "Line" },
  { id: "arrow", label: "Arrow" },
  { id: "rect", label: "Rect" },
  { id: "circle", label: "Circle" },
  { id: "triangle", label: "Triangle" },
  { id: "text", label: "Text" },
  { id: "sticky", label: "Sticky" },
];

/** Builds a valid multi-page PDF 1.4 binary wrapping one JPEG image per page (zero external deps). */
function jpegsToMultiPagePdfBlob(jpegDataUrls: string[], width: number, height: number): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let pos = 0;
  const pushStr = (s: string) => {
    const b = enc.encode(s);
    chunks.push(b);
    pos += b.length;
  };
  const pushBytes = (b: Uint8Array) => {
    chunks.push(b);
    pos += b.length;
  };

  const n = jpegDataUrls.length;
  const pageIds = Array.from({ length: n }, (_, i) => 3 + i * 3);

  pushStr("%PDF-1.4\n");
  offsets.push(pos);
  pushStr("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  offsets.push(pos);
  pushStr(`2 0 obj\n<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${n} >>\nendobj\n`);

  for (let i = 0; i < n; i++) {
    const pageId = 3 + i * 3;
    const imgId = pageId + 1;
    const contentId = pageId + 2;
    const b64 = jpegDataUrls[i].split(",")[1] ?? "";
    const bin = atob(b64);
    const imgBytes = new Uint8Array(bin.length);
    for (let j = 0; j < bin.length; j++) imgBytes[j] = bin.charCodeAt(j);

    offsets.push(pos);
    pushStr(`${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 ${imgId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`);
    offsets.push(pos);
    pushStr(`${imgId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgBytes.length} >>\nstream\n`);
    pushBytes(imgBytes);
    pushStr("\nendstream\nendobj\n");
    const content = `q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`;
    offsets.push(pos);
    pushStr(`${contentId} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);
  }

  const xrefPos = pos;
  pushStr(`xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`);
  for (const off of offsets) pushStr(`${String(off).padStart(10, "0")} 00000 n \n`);
  pushStr(`trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`);
  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  tool: DrawTool,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  size: number,
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (tool === "line" || tool === "arrow") {
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    if (tool === "arrow") {
      const ang = Math.atan2(y1 - y0, x1 - x0);
      const head = Math.max(12, size * 4);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - head * Math.cos(ang - Math.PI / 6), y1 - head * Math.sin(ang - Math.PI / 6));
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - head * Math.cos(ang + Math.PI / 6), y1 - head * Math.sin(ang + Math.PI / 6));
      ctx.stroke();
    }
  } else if (tool === "rect") {
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  } else if (tool === "circle") {
    const rx = Math.abs(x1 - x0) / 2;
    const ry = Math.abs(y1 - y0) / 2;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (tool === "triangle") {
    ctx.moveTo((x0 + x1) / 2, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x0, y1);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Pro Connected Classroom Whiteboard (inspired by Teachmint, Excalidraw, GoodNotes & Microsoft Whiteboard):
 * Pen, Highlighter, Eraser, Laser Pointer, Shapes (Line, Arrow, Rect, Circle, Triangle),
 * Text, Sticky Notes, Image Insert, Math Symbols, Multi-Page Slides, Undo/Redo, Zoom, Fullscreen,
 * 5 Backgrounds (Blank, Grid, Ruled, Dots, Chalkboard), 6 Export Formats + Live Class Polls.
 */
export function WhiteboardTool({ notify, batchNames }: ToolProps) {
  const lms = useLms();
  const { t } = useLang();
  const W = t.board2;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const drawing = useRef(false);
  const startPt = useRef({ x: 0, y: 0 });
  const viewRef = useRef<HTMLDivElement>(null);
  const snapshot = useRef<ImageData | null>(null);
  const history = useRef<Snap[]>([]);
  const redoStack = useRef<Snap[]>([]);
  const origin = useRef({ x: 0, y: 0 }); // how far the board has grown to the left / top (keeps undo steps lined up)
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const spaceHeld = useRef(false);
  const [dims, setDims] = useState(START);
  const [liveShare, setLiveShare] = useState(""); // batch whose live class sees this board ("" = off)

  // Multi-page slides (stored as data URLs)
  const [slides, setSlides] = useState<(string | null)[]>([null]);
  const [slideIdx, setSlideIdx] = useState(0);
  const [targetModuleId, setTargetModuleId] = useState<number>(lms.modules[0]?.id ?? 0);
  const [savingToModule, setSavingToModule] = useState(false);

  const [tool, setTool] = useState<DrawTool>("pen");
  const [color, setColor] = useState(COLORS[0].hex);
  const [size, setSize] = useState(3);
  const [bg, setBg] = useState<BgMode>("grid");
  const [zoom, setZoom] = useState(100);
  const scale = zoom / 100;

  // Set the board size once; React must never touch canvas width/height afterwards (that would wipe the drawing).
  useEffect(() => {
    const c = canvasRef.current;
    if (c && c.width !== START.w) {
      c.width = START.w;
      c.height = START.h;
    }
  }, []);

  // Ctrl/⌘ + wheel (and trackpad pinch) zooms around the pointer; plain wheel scrolls the board.
  useEffect(() => {
    const v = viewRef.current;
    if (!v) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => {
        const next = Math.round(Math.min(300, Math.max(25, z * (e.deltaY < 0 ? 1.1 : 0.9))));
        const r = v.getBoundingClientRect();
        const mx = e.clientX - r.left, my = e.clientY - r.top;
        const bx = (v.scrollLeft + mx) / (z / 100), by = (v.scrollTop + my) / (z / 100);
        requestAnimationFrame(() => {
          v.scrollLeft = bx * (next / 100) - mx;
          v.scrollTop = by * (next / 100) - my;
        });
        return next;
      });
    };
    v.addEventListener("wheel", onWheel, { passive: false });
    return () => v.removeEventListener("wheel", onWheel);
  }, []);

  // Hold Space to drag the board with any tool (like design apps).
  useEffect(() => {
    const typing = (e: KeyboardEvent) => (e.target as HTMLElement)?.closest?.("input, textarea, select");
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !typing(e)) spaceHeld.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceHeld.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);
  const [exportFmt, setExportFmt] = useState<ExportFormat>("png");
  const [laserPt, setLaserPt] = useState<{ x: number; y: number } | null>(null);

  // Floating text / sticky note input
  const [textInput, setTextInput] = useState<{ x: number; y: number; value: string; isSticky: boolean } | null>(null);


  // Keyboard shortcuts: Ctrl+Z (Undo), Ctrl+Y / Ctrl+Shift+Z (Redo)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const saveCurrentSlide = () => {
    const c = canvasRef.current;
    if (!c) return slides;
    const url = c.toDataURL("image/png");
    const next = slides.map((s, i) => (i === slideIdx ? url : s));
    setSlides(next);
    return next;
  };

  const loadSlideData = async (dataUrl: string | null) => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    history.current = [];
    redoStack.current = [];
    origin.current = { x: 0, y: 0 };
    const img = dataUrl ? await loadImg(dataUrl) : null;
    c.width = Math.max(START.w, img?.width ?? 0); // resizing also clears the board
    c.height = Math.max(START.h, img?.height ?? 0);
    if (img) ctx.drawImage(img, 0, 0);
    setDims({ w: c.width, h: c.height });
    viewRef.current?.scrollTo(0, 0);
  };

  const switchSlide = (targetIdx: number) => {
    const updated = saveCurrentSlide();
    setSlideIdx(targetIdx);
    loadSlideData(updated[targetIdx] ?? null);
  };

  const addSlide = () => {
    const updated = saveCurrentSlide();
    const next = [...updated, null];
    setSlides(next);
    setSlideIdx(next.length - 1);
    loadSlideData(null);
    notify(W.added(next.length));
  };

  const duplicateSlide = () => {
    const updated = saveCurrentSlide();
    const copy = updated[slideIdx] ?? null;
    const next = [...updated.slice(0, slideIdx + 1), copy, ...updated.slice(slideIdx + 1)];
    setSlides(next);
    setSlideIdx(slideIdx + 1);
    loadSlideData(copy);
    notify(W.duplicated(slideIdx + 2));
  };

  const deleteSlide = () => {
    if (slides.length <= 1) return clearBoard();
    const next = slides.filter((_, i) => i !== slideIdx);
    const nextIdx = Math.max(0, slideIdx - 1);
    setSlides(next);
    setSlideIdx(nextIdx);
    loadSlideData(next[nextIdx] ?? null);
  };

  const getPt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
  };

  const takeSnap = (): Snap => {
    const c = canvasRef.current!;
    return { blob: new Promise((res) => c.toBlob(res)), ox: origin.current.x, oy: origin.current.y }; // copied now, compressed later
  };
  const restoreSnap = async (snap: Snap) => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    const blob = await snap.blob;
    if (!c || !ctx || !blob) return;
    const bmp = await createImageBitmap(blob);
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, origin.current.x - snap.ox, origin.current.y - snap.oy);
    ctx.restore();
  };

  const changed = useRef(true); // something new to show students since the last picture
  const pushHistory = () => {
    changed.current = true;
    if (!canvasRef.current) return;
    history.current.push(takeSnap());
    if (history.current.length > 30) history.current.shift();
    redoStack.current = [];
  };

  /** Drawing near an edge makes the board bigger on that side. Returns how far existing content moved (left/top growth). */
  const growFor = (pt: { x: number; y: number }) => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return { dx: 0, dy: 0, resized: false };
    const left = pt.x < EDGE ? Math.max(GROW, EDGE - pt.x) : 0;
    const top = pt.y < EDGE ? Math.max(GROW, EDGE - pt.y) : 0;
    const right = pt.x > c.width - EDGE ? Math.max(GROW, pt.x - c.width + EDGE) : 0;
    const bottom = pt.y > c.height - EDGE ? Math.max(GROW, pt.y - c.height + EDGE) : 0;
    if (!(left || top || right || bottom)) return { dx: 0, dy: 0, resized: false };
    const w = c.width + left + right, h = c.height + top + bottom;
    if (w * h > MAX_AREA) return { dx: 0, dy: 0, resized: false }; // largest board the phone browsers can hold
    const copy = document.createElement("canvas");
    copy.width = c.width;
    copy.height = c.height;
    copy.getContext("2d")!.drawImage(c, 0, 0);
    if (snapshot.current) {
      // shape preview: keep the "before" picture in step with the bigger board
      const before = document.createElement("canvas");
      before.width = c.width;
      before.height = c.height;
      before.getContext("2d")!.putImageData(snapshot.current, 0, 0);
      const grown = document.createElement("canvas");
      grown.width = w;
      grown.height = h;
      const gctx = grown.getContext("2d")!;
      gctx.drawImage(before, left, top);
      snapshot.current = gctx.getImageData(0, 0, w, h);
    }
    c.width = w;
    c.height = h;
    ctx.drawImage(copy, left, top);
    origin.current = { x: origin.current.x + left, y: origin.current.y + top };
    startPt.current = { x: startPt.current.x + left, y: startPt.current.y + top };
    const v = viewRef.current;
    if (v && (left || top)) {
      v.scrollLeft += left * scale; // keep what you're looking at in place
      v.scrollTop += top * scale;
    }
    setDims({ w, h });
    return { dx: left, dy: top, resized: true };
  };

  const startPan = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const v = viewRef.current;
    if (!v) return;
    canvasRef.current?.setPointerCapture(e.pointerId);
    pan.current = { x: e.clientX, y: e.clientY, left: v.scrollLeft, top: v.scrollTop };
  };

  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    if (tool === "hand" || spaceHeld.current || e.button === 1) return startPan(e);
    const pt = getPt(e);

    if (tool === "laser") {
      setLaserPt({ x: (pt.x / c.width) * 100, y: (pt.y / c.height) * 100 });
      return;
    }

    if (tool === "text" || tool === "sticky") {
      setTextInput({ x: pt.x, y: pt.y, value: "", isSticky: tool === "sticky" });
      return;
    }

    c.setPointerCapture(e.pointerId);
    pushHistory();
    drawing.current = true;
    startPt.current = pt;

    if (tool === "pen" || tool === "highlighter" || tool === "eraser") {
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
    } else {
      snapshot.current = ctx.getImageData(0, 0, c.width, c.height);
    }
  };

  const moveDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const v = viewRef.current;
    if (pan.current && v) {
      v.scrollLeft = pan.current.left - (e.clientX - pan.current.x);
      v.scrollTop = pan.current.top - (e.clientY - pan.current.y);
      return;
    }
    let pt = getPt(e);

    if (tool === "laser") {
      setLaserPt({ x: (pt.x / c.width) * 100, y: (pt.y / c.height) * 100 });
      return;
    }

    if (!drawing.current) return;
    if (v) {
      // drawing near the edge of the visible area scrolls the board along with the pen
      const r = v.getBoundingClientRect(), m = 40, step = 18;
      if (e.clientX > r.right - m) v.scrollLeft += step;
      else if (e.clientX < r.left + m) v.scrollLeft -= step;
      if (e.clientY > r.bottom - m) v.scrollTop += step;
      else if (e.clientY < r.top + m) v.scrollTop -= step;
    }
    const moved = growFor(pt);
    if (moved.resized) {
      // resizing a canvas resets its settings and the current line, so pick the line up again where it was
      pt = { x: pt.x + moved.dx, y: pt.y + moved.dy };
      if (tool === "pen" || tool === "highlighter" || tool === "eraser") {
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
      }
    }

    if (tool === "pen" || tool === "highlighter" || tool === "eraser") {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (tool === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.lineWidth = size * 6;
        ctx.globalAlpha = 1;
      } else if (tool === "highlighter") {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = color;
        ctx.lineWidth = size * 5;
        ctx.globalAlpha = 0.25;
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = color;
        ctx.lineWidth = size;
        ctx.globalAlpha = 1;
      }
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    } else if (snapshot.current) {
      ctx.putImageData(snapshot.current, 0, 0);
      drawShape(ctx, tool, startPt.current.x, startPt.current.y, pt.x, pt.y, color, size);
    }
  };

  const endDraw = () => {
    pan.current = null;
    drawing.current = false;
    snapshot.current = null;
  };

  const commitText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput || !textInput.value.trim()) {
      setTextInput(null);
      return;
    }
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    pushHistory();
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    if (textInput.isSticky) {
      const w = 220;
      const h = 110;
      ctx.fillStyle = "#fef08a";
      ctx.strokeStyle = "#eab308";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(textInput.x, textInput.y, w, h, 14);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#171d1b";
      ctx.font = "600 18px system-ui, sans-serif";
      const words = textInput.value.trim().split(" ");
      let line = "";
      let ly = textInput.y + 32;
      for (const word of words) {
        if (ctx.measureText(line + word).width > w - 24) {
          ctx.fillText(line, textInput.x + 12, ly);
          line = word + " ";
          ly += 24;
        } else {
          line += word + " ";
        }
      }
      if (line) ctx.fillText(line, textInput.x + 12, ly);
    } else {
      ctx.fillStyle = color;
      ctx.font = `700 ${Math.max(20, size * 6)}px system-ui, sans-serif`;
      ctx.fillText(textInput.value.trim(), textInput.x, textInput.y);
    }
    ctx.restore();
    setTextInput(null);
  };

  const insertImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const c = canvasRef.current;
        const ctx = c?.getContext("2d");
        if (!c || !ctx) return;
        pushHistory();
        const v = viewRef.current;
        const vw = (v?.clientWidth ?? 800) / scale, vh = (v?.clientHeight ?? 500) / scale;
        const fit = Math.min((vw * 0.7) / img.width, (vh * 0.7) / img.height, 1);
        const w = img.width * fit;
        const h = img.height * fit;
        const cx = ((v?.scrollLeft ?? 0) / scale) + vw / 2, cy = ((v?.scrollTop ?? 0) / scale) + vh / 2;
        ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
        notify(W.imageAdded);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const undo = async () => {
    changed.current = true;
    const prev = history.current.pop();
    if (!prev || !canvasRef.current) return;
    redoStack.current.push(takeSnap());
    await restoreSnap(prev);
  };

  const redo = async () => {
    changed.current = true;
    const next = redoStack.current.pop();
    if (!next || !canvasRef.current) return;
    history.current.push(takeSnap());
    await restoreSnap(next);
  };

  const clearBoard = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    pushHistory();
    ctx.clearRect(0, 0, c.width, c.height);
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else wrapRef.current?.requestFullscreen?.();
  };

  /** Board picture with its background, cropped to where there is ink. */
  const renderComposite = async (dataUrl: string | null) => {
    const img = dataUrl ? await loadImg(dataUrl) : null;
    const src = document.createElement("canvas");
    src.width = img?.width ?? PAGE.w;
    src.height = img?.height ?? PAGE.h;
    if (img) src.getContext("2d")!.drawImage(img, 0, 0);
    const box = inkBox(src);
    const w = box.w, h = box.h;
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const octx = out.getContext("2d")!;
    octx.fillStyle = bg === "chalkboard" ? "#16302b" : "#ffffff";
    octx.fillRect(0, 0, w, h);

    if (bg === "grid") {
      octx.strokeStyle = "rgba(0,106,96,0.12)";
      octx.lineWidth = 1;
      for (let x = 0; x <= w; x += 28) {
        octx.beginPath();
        octx.moveTo(x, 0);
        octx.lineTo(x, h);
        octx.stroke();
      }
      for (let y = 0; y <= h; y += 28) {
        octx.beginPath();
        octx.moveTo(0, y);
        octx.lineTo(w, y);
        octx.stroke();
      }
    } else if (bg === "ruled") {
      octx.strokeStyle = "rgba(0,106,96,0.14)";
      octx.lineWidth = 1;
      for (let y = 32; y <= h; y += 32) {
        octx.beginPath();
        octx.moveTo(0, y);
        octx.lineTo(w, y);
        octx.stroke();
      }
    } else if (bg === "dots") {
      octx.fillStyle = "rgba(0,106,96,0.22)";
      for (let x = 24; x < w; x += 24) {
        for (let y = 24; y < h; y += 24) octx.fillRect(x, y, 2, 2);
      }
    }
    if (img) octx.drawImage(src, -box.x, -box.y);
    return out;
  };
  const buildAllSlidesPdf = async () => {
    if (!canvasRef.current) return null;
    const allSlides = saveCurrentSlide();
    const jpegs: string[] = [];
    for (const s of allSlides) {
      const comp = await renderComposite(s);
      const page = document.createElement("canvas"); // fit each slide onto the same page size
      page.width = PAGE.w;
      page.height = PAGE.h;
      const pctx = page.getContext("2d")!;
      pctx.fillStyle = bg === "chalkboard" ? "#16302b" : "#ffffff";
      pctx.fillRect(0, 0, PAGE.w, PAGE.h);
      const k = Math.min(PAGE.w / comp.width, PAGE.h / comp.height, 1);
      pctx.drawImage(comp, (PAGE.w - comp.width * k) / 2, (PAGE.h - comp.height * k) / 2, comp.width * k, comp.height * k);
      jpegs.push(page.toDataURL("image/jpeg", 0.92));
    }
    return { blob: jpegsToMultiPagePdfBlob(jpegs, PAGE.w, PAGE.h), count: allSlides.length };
  };

  const publishToCourseModule = async () => {
    if (!targetModuleId) return;
    setSavingToModule(true);
    try {
      const res = await buildAllSlidesPdf();
      if (!res) return;
      const file = new File([res.blob], `Whiteboard-Notes-${Date.now()}.pdf`, { type: "application/pdf" });
      const url = await saveFile(file);
      lms.addModuleItem(targetModuleId, {
        kind: "pdf",
        title: W.notesTitle(res.count),
        meta: W.notesMeta(res.count),
        url,
      });
      notify(W.published(res.count));
    } catch {
      notify(W.saveFailed);
    } finally {
      setSavingToModule(false);
    }
  };

  const exportBoard = async () => {
    const c = canvasRef.current;
    if (!c) return;
    const stamp = Date.now();
    const triggerDownload = (href: string, filename: string, revoke = false) => {
      const a = document.createElement("a");
      a.href = href;
      a.download = filename;
      a.click();
      if (revoke) setTimeout(() => URL.revokeObjectURL(href), 1500);
    };

    if (exportFmt === "pdf") {
      const res = await buildAllSlidesPdf();
      if (!res) return;
      triggerDownload(URL.createObjectURL(res.blob), `classbari-whiteboard-${res.count}-slides-${stamp}.pdf`, true);
      notify(W.exportedPdf(res.count));
      return;
    }

    const out = await renderComposite(c.toDataURL("image/png"));
    if (exportFmt === "svg") {
      const png = out.toDataURL("image/png");
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${out.width}" height="${out.height}" viewBox="0 0 ${out.width} ${out.height}"><image href="${png}" width="${out.width}" height="${out.height}" /></svg>`;
      const blob = new Blob([svg], { type: "image/svg+xml" });
      triggerDownload(URL.createObjectURL(blob), `classbari-slide-${slideIdx + 1}-${stamp}.svg`, true);
      notify(W.exported(slideIdx + 1, "SVG"));
      return;
    }
    if (exportFmt === "avif") {
      const avifUrl = out.toDataURL("image/avif", 0.9);
      if (avifUrl.startsWith("data:image/avif")) {
        triggerDownload(avifUrl, `classbari-slide-${slideIdx + 1}-${stamp}.avif`);
        notify(W.exported(slideIdx + 1, "AVIF"));
      } else {
        triggerDownload(out.toDataURL("image/webp", 0.92), `classbari-slide-${slideIdx + 1}-${stamp}.webp`);
        notify(W.noAvif);
      }
      return;
    }
    const mime = exportFmt === "jpeg" ? "image/jpeg" : exportFmt === "webp" ? "image/webp" : "image/png";
    const ext = exportFmt === "jpeg" ? "jpg" : exportFmt;
    triggerDownload(out.toDataURL(mime, 0.92), `classbari-slide-${slideIdx + 1}-${stamp}.${ext}`);
    notify(W.exported(slideIdx + 1, exportFmt.toUpperCase()));
  };

  useEffect(() => {
    if (!liveShare) return;
    changed.current = true;
    const send = async () => {
      const c = canvasRef.current;
      if (!c || !changed.current) return;
      changed.current = false;
      const full = await renderComposite(c.toDataURL("image/png"));
      const k = Math.min(1, 1280 / full.width); // small enough for slow phone internet
      const small = document.createElement("canvas");
      small.width = Math.round(full.width * k);
      small.height = Math.round(full.height * k);
      small.getContext("2d")!.drawImage(full, 0, 0, small.width, small.height);
      let img = small.toDataURL("image/jpeg", 0.72);
      if (img.length > BOARD_MAX_CHARS) img = small.toDataURL("image/jpeg", 0.45);
      if (img.length <= BOARD_MAX_CHARS) shareBoard(liveShare, img);
    };
    send();
    const id = setInterval(send, 3000);
    return () => clearInterval(id);
  }, [liveShare, bg]);

  const bgStyle: React.CSSProperties =
    bg === "grid"
      ? {
          backgroundColor: "#ffffff",
          backgroundImage:
            "linear-gradient(to right, rgba(0,106,96,0.09) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,106,96,0.09) 1px, transparent 1px)",
          backgroundSize: `${28 * scale}px ${28 * scale}px`,
        }
      : bg === "ruled"
        ? {
            backgroundColor: "#ffffff",
            backgroundImage: "linear-gradient(to bottom, rgba(0,106,96,0.12) 1px, transparent 1px)",
            backgroundSize: `100% ${32 * scale}px`,
          }
        : bg === "dots"
          ? {
              backgroundColor: "#ffffff",
              backgroundImage: "radial-gradient(rgba(0,106,96,0.22) 1.5px, transparent 1.5px)",
              backgroundSize: `${24 * scale}px ${24 * scale}px`,
            }
          : bg === "chalkboard"
            ? { backgroundColor: "#16302b" }
            : { backgroundColor: "#ffffff" };


  return (
    <div className="flex flex-col gap-6">
      {/* Pro Interactive Whiteboard */}
      <div ref={wrapRef} className="flex flex-col gap-3 rounded-[18px] border border-outline-variant bg-white p-4">
        {/* Row 1: Drawing & Shape Tools */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {TOOL_BUTTONS.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  setTool(b.id);
                  if (b.id !== "laser") setLaserPt(null);
                }}
                className={`h-8 rounded-full px-3 text-xs font-bold transition-all ${
                  tool === b.id ? "bg-primary text-on-primary shadow-xs" : "bg-surface-container text-on-surface"
                }`}
              >
                {W.tools[b.id]}
              </button>
            ))}
            <input ref={imgInputRef} type="file" accept="image/*" onChange={insertImage} className="hidden" />
            <button
              type="button"
              onClick={() => imgInputRef.current?.click()}
              className="h-8 rounded-full bg-secondary-container px-3 text-xs font-bold text-on-secondary-container"
            >
              + {W.image}
            </button>
          </div>

          {/* Undo, Redo, Clear, Fullscreen, Multi-Format Export */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={undo} title={`${W.undo} (Ctrl+Z)`} className="h-8 rounded-full bg-surface-container px-3 text-xs font-bold">
              {W.undo}
            </button>
            <button type="button" onClick={redo} title={`${W.redo} (Ctrl+Y)`} className="h-8 rounded-full bg-surface-container px-3 text-xs font-bold">
              {W.redo}
            </button>
            <button type="button" onClick={clearBoard} className="h-8 rounded-full bg-error-container px-3 text-xs font-bold text-on-error-container">
              {W.clear}
            </button>
            <button type="button" onClick={toggleFullscreen} className="h-8 rounded-full bg-surface-container px-3 text-xs font-bold">
              ⛶ {t.video.fullscreen}
            </button>
            <select
              aria-label={W.format}
              value={exportFmt}
              onChange={(e) => setExportFmt(e.target.value as ExportFormat)}
              className="h-8 rounded-full border border-outline-variant bg-white px-2.5 text-xs font-bold text-on-surface outline-none"
            >
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
              <option value="pdf">PDF</option>
              <option value="webp">WebP</option>
              <option value="avif">AVIF / HEIF</option>
              <option value="svg">SVG</option>
            </select>
            <button type="button" onClick={exportBoard} className="h-8 rounded-full bg-primary px-3.5 text-xs font-bold text-on-primary">
              {W.export}
            </button>
          </div>
        </div>

        {/* Row 2: Colors, Stroke Slider, Backgrounds, Zoom, Slides */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-container/50 px-3 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c.hex}
                type="button"
                aria-label={W.colors[c.name as keyof typeof W.colors]}
                onClick={() => {
                  setColor(c.hex);
                  if (tool === "eraser") setTool("pen");
                }}
                style={{ backgroundColor: c.hex }}
                className={`h-6 w-6 rounded-full border-2 ${color === c.hex ? "scale-110 border-primary ring-2 ring-primary/30" : "border-outline-variant"}`}
              />
            ))}
            <input
              type="color"
              aria-label={W.customColor}
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-6 w-7 cursor-pointer rounded border-0 bg-transparent"
            />
            <span className="mx-1 h-4 w-px bg-outline-variant" />
            <label className="flex items-center gap-1.5 text-xs font-bold text-on-surface-variant">
              {W.size(size)}
              <input
                type="range"
                min={1}
                max={20}
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
                className="w-20 accent-primary"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(["blank", "grid", "ruled", "dots", "chalkboard"] as BgMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setBg(m);
                  if (m === "chalkboard" && color === "#171d1b") setColor("#ffffff");
                  if (m !== "chalkboard" && color === "#ffffff") setColor("#171d1b");
                }}
                className={`h-7 rounded-full px-2.5 text-[11px] font-bold capitalize ${
                  bg === m ? "bg-tertiary-container text-on-tertiary-container" : "bg-white text-on-surface-variant"
                }`}
              >
                {W.bg[m]}
              </button>
            ))}
            <span className="mx-1 h-4 w-px bg-outline-variant" />
            <button type="button" onClick={() => setZoom((z) => Math.max(25, z - 25))} className="h-7 w-7 rounded-full bg-white text-xs font-bold">
              −
            </button>
            <span className="text-xs font-bold">{zoom}%</span>
            <button type="button" onClick={() => setZoom((z) => Math.min(300, z + 25))} className="h-7 w-7 rounded-full bg-white text-xs font-bold">
              +
            </button>
          </div>
        </div>

        {/* Row 3: Math / Physics Quick Symbol Bar & Multi-Page Slides */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 font-bold text-on-surface-variant">{W.symbols}</span>
            {MATH_SYMBOLS.map((sym) => (
              <button
                key={sym}
                type="button"
                onClick={() => {
                  if (textInput) setTextInput({ ...textInput, value: textInput.value + sym });
                  else setTextInput({ x: 120, y: 120, value: sym, isSticky: false });
                }}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-outline-variant bg-white font-bold hover:bg-primary-container"
              >
                {sym}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={slideIdx === 0}
              onClick={() => switchSlide(slideIdx - 1)}
              className="h-7 rounded-full bg-surface-container px-2.5 font-bold disabled:opacity-40"
            >
              ←
            </button>
            <span className="font-bold">
              {W.slide(slideIdx + 1, slides.length)}
            </span>
            <button
              type="button"
              disabled={slideIdx >= slides.length - 1}
              onClick={() => switchSlide(slideIdx + 1)}
              className="h-7 rounded-full bg-surface-container px-2.5 font-bold disabled:opacity-40"
            >
              →
            </button>
            <button type="button" onClick={addSlide} className="h-7 rounded-full bg-primary-container px-2.5 font-bold text-on-primary-container">
              + {W.addSlide}
            </button>
            <button type="button" onClick={duplicateSlide} className="h-7 rounded-full bg-surface-container px-2.5 font-bold">
              {W.dup}
            </button>
            {slides.length > 1 && (
              <button type="button" onClick={deleteSlide} className="h-7 rounded-full bg-error-container px-2.5 font-bold text-on-error-container">
                {W.del}
              </button>
            )}
          </div>
        </div>

        {/* Row 4: One-click Publish Whiteboard PDF to Course Module */}
        {lms.modules.length > 0 && (
          <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
            <span className="font-bold text-on-surface-variant">{W.saveTo}</span>
            <select
              aria-label={W.saveTo}
              value={targetModuleId}
              onChange={(e) => setTargetModuleId(Number(e.target.value))}
              className="h-8 rounded-full border border-outline-variant bg-white px-3 text-xs font-semibold outline-none"
            >
              {lms.modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.batch} — {m.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={savingToModule}
              onClick={publishToCourseModule}
              className="h-8 rounded-full bg-secondary-container px-3.5 text-xs font-bold text-on-secondary-container disabled:opacity-50"
            >
              {savingToModule ? W.saving : W.save}
            </button>
          </div>
        )}

        {/* Canvas Viewport */}
        <div ref={viewRef} data-testid="board-view" className="relative h-[62vh] min-h-[380px] overflow-auto rounded-xl border border-outline-variant bg-surface-container/30">
          <div className="relative" style={{ width: dims.w * scale, height: dims.h * scale }}>
            <canvas
              ref={canvasRef}
              onPointerDown={startDraw}
              onPointerMove={moveDraw}
              onPointerUp={endDraw}
              onPointerCancel={endDraw}
              onPointerLeave={() => {
                endDraw();
                if (tool === "laser") setLaserPt(null);
              }}
              style={bgStyle}
              className={`block h-full w-full touch-none ${tool === "laser" ? "cursor-none" : tool === "hand" ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair"}`}
            />

            {/* Laser Pointer Dot */}
            {tool === "laser" && laserPt && (
              <span
                style={{ left: `${laserPt.x}%`, top: `${laserPt.y}%` }}
                className="pointer-events-none absolute -ml-2.5 -mt-2.5 h-5 w-5 rounded-full bg-red-600 shadow-[0_0_16px_6px_rgba(220,38,38,0.85)]"
              />
            )}

            {/* Inline Text / Sticky Note Composer */}
            {textInput && (
              <form
                onSubmit={commitText}
                style={{ left: textInput.x * scale, top: textInput.y * scale }}
                className="absolute z-20 flex items-center gap-1.5 rounded-xl border-2 border-primary bg-white p-2 shadow-xl"
              >
                <input
                  autoFocus
                  value={textInput.value}
                  onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
                  placeholder={textInput.isSticky ? W.stickyPh : W.textPh}
                  className="h-9 w-48 rounded-[10px] border border-outline px-3 text-sm outline-none"
                />
                <button type="submit" className="h-9 rounded-[10px] bg-primary px-3 text-xs font-bold text-on-primary">
                  {W.place}
                </button>
                <button type="button" onClick={() => setTextInput(null)} className="h-9 rounded-[10px] bg-surface-container px-2.5 text-xs font-bold">
                  ✕
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Show the board to the live class: a small picture every few seconds, only when it changed */}
      <label className="flex flex-wrap items-center gap-3 rounded-[16px] border border-outline-variant bg-white px-4 py-3 text-sm font-semibold">
        <input type="checkbox" checked={!!liveShare} onChange={(e) => setLiveShare(e.target.checked ? batchNames[0] ?? "" : "")} className="h-5 w-5 accent-primary" />
        📡 {t.liveRoom.shareBoard}
        {liveShare && (
          <select value={liveShare} onChange={(e) => setLiveShare(e.target.value)} aria-label={t.liveRoom.shareBatch} className="h-9 rounded-[10px] border border-outline bg-transparent px-2">
            {batchNames.map((b) => <option key={b}>{b}</option>)}
          </select>
        )}
      </label>

      {/* Live class poll (server-backed, reaches every student device in the batch) */}
      <PollLauncher batchNames={batchNames} notify={notify} />
    </div>
  );
}

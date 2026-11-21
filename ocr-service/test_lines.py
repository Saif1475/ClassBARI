"""Checks the line finder without loading the model. Run: .venv/bin/python -m unittest test_lines"""

import unittest

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from app import find_lines


def page(lines: list[str], size=(1200, 900)) -> np.ndarray:
    img = Image.new("L", size, 255)
    draw = ImageDraw.Draw(img)
    font = ImageFont.load_default(size=48)
    for i, text in enumerate(lines):
        draw.text((80, 80 + i * 150), text, fill=0, font=font)
    return np.array(img)


class FindLines(unittest.TestCase):
    def test_finds_each_line_top_to_bottom(self):
        boxes = find_lines(page(["Simple harmonic motion", "T = 2 pi sqrt(L / g)", "Energy is conserved"]))
        self.assertEqual(len(boxes), 3)
        self.assertEqual([b[1] for b in boxes], sorted(b[1] for b in boxes))
        for x0, y0, x1, y1 in boxes:
            self.assertGreater(x1 - x0, 200)  # covers the words, not just a letter

    def test_blank_page_has_no_lines(self):
        self.assertEqual(find_lines(page([])), [])

    def test_specks_are_ignored(self):
        img = page(["One real line"])
        img[700:702, 500:502] = 0  # a dot of dirt
        self.assertEqual(len(find_lines(img)), 1)


if __name__ == "__main__":
    unittest.main()

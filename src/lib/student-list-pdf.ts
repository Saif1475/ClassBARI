// A student list as a PDF in the template's columns: printed to fill in by hand, or filled in on a computer and imported
// again ("Import students" reads a PDF table). pdf-lib's built-in font has no Bangla letters, so it is all in English.
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { TEMPLATE_HEADER } from "./sheet.ts";

const WIDTHS = [96, 136, 96, 136, 72, 72, 66, 56, 56]; // an A4 page across, less its margins: 786 points
const LEFT = 28, ROW = 20, PER_PAGE = 22;

/** `rows`: the students to show; none gives empty lines to fill in. The title and the note go above the first table. */
export async function studentListPdf(rows: string[][], title: string, note: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const grey = rgb(0.6, 0.65, 0.63);
  // A long value is written smaller to fit its cell (a Gmail must never lose a letter); only one too long even at the
  // smallest size is cut, with "…" to show it. A letter the font lacks (Bangla) would stop the whole file, so it goes.
  const fit = (s: string, width: number, f: PDFFont) => {
    let text = [...s].filter((ch) => f.getCharacterSet().includes(ch.codePointAt(0)!)).join("");
    const size = Math.max(4.5, Math.min(8, (width - 8) / f.widthOfTextAtSize(text, 1)));
    if (f.widthOfTextAtSize(text, size) > width - 7.9) { // a hair of room: at the exact width, rounding would cut it
      while (text && f.widthOfTextAtSize(`${text}…`, size) > width - 8) text = text.slice(0, -1);
      text += "…";
    }
    return { text, size };
  };
  const lines = rows.length ? rows : Array.from({ length: PER_PAGE }, () => [] as string[]);
  for (let start = 0; start < lines.length; start += PER_PAGE) {
    const page = pdf.addPage([842, 595]);
    let y = 555;
    if (start === 0) {
      page.drawText(title, { x: LEFT, y, size: 16, font: bold });
      page.drawText(note, { x: LEFT, y: y - 18, size: 9, font, color: rgb(0.35, 0.35, 0.35) });
      y -= 30;
    }
    const top = y;
    page.drawRectangle({ x: LEFT, y: y - ROW, width: 786, height: ROW, color: rgb(0.88, 0.95, 0.92) });
    const cells = (values: string[], f: PDFFont) => {
      let x = LEFT;
      values.forEach((v, i) => {
        const t = v && fit(v, WIDTHS[i], f);
        if (t) page.drawText(t.text, { x: x + 4, y: y - 14, size: t.size, font: f });
        x += WIDTHS[i];
      });
    };
    cells(TEMPLATE_HEADER, bold);
    for (const r of lines.slice(start, start + PER_PAGE)) {
      y -= ROW;
      cells(r, font);
    }
    y -= ROW;
    // The table's lines: under every row, and between the columns.
    for (let at = top; at >= y; at -= ROW) page.drawLine({ start: { x: LEFT, y: at }, end: { x: LEFT + 786, y: at }, thickness: 0.5, color: grey });
    let x = LEFT;
    for (const w of [0, ...WIDTHS]) {
      x += w;
      page.drawLine({ start: { x, y: top }, end: { x, y }, thickness: 0.5, color: grey });
    }
  }
  return pdf.save();
}

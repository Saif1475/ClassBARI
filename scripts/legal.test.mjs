// Run: npm test — the privacy policy and terms: Bangla matches English section by section, blanks are filled in.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fillLegal, LEGAL } from "../src/lib/legal-info.ts";
import { LEGAL_TEXT } from "../src/lib/legal-text.ts";

const text = (doc) => [doc.intro, ...doc.sections.flatMap((s) => [s.title, ...s.blocks.flatMap((b) => (typeof b === "string" ? [b] : "list" in b ? b.list : b.table.flat()))])].join(" ");

test("the Bangla text has the same sections, lists and tables as the English", () => {
  for (const which of ["privacy", "terms"]) {
    const en = LEGAL_TEXT.en[which], bn = LEGAL_TEXT.bn[which];
    assert.deepEqual(bn.sections.map((s) => s.id), en.sections.map((s) => s.id), which);
    en.sections.forEach((s, i) =>
      s.blocks.forEach((b, j) => {
        const o = bn.sections[i].blocks[j];
        assert.equal(typeof o, typeof b, `${which} ${s.id} ${j}`);
        if (typeof b !== "string" && "list" in b) assert.equal(o.list.length, b.list.length, `${which} ${s.id} list`);
        if (typeof b !== "string" && "table" in b) assert.deepEqual(o.table.map((r) => r.length), b.table.map((r) => r.length), `${which} ${s.id} table`);
      }),
    );
  }
});

test("every {blank} in the text is one legal-info.ts fills in", () => {
  for (const lang of ["en", "bn"])
    for (const which of ["privacy", "terms"]) {
      const used = [...text(LEGAL_TEXT[lang][which]).matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      for (const k of used) assert.ok(k in LEGAL, `${lang} ${which}: {${k}} has no value`);
    }
  assert.equal(fillLegal("Write to {email}."), `Write to ${LEGAL.email}.`);
});

test("the privacy policy says how to delete an account (needed for the app stores)", () => {
  assert.ok(LEGAL_TEXT.en.privacy.sections.some((s) => s.id === "delete-account"));
});

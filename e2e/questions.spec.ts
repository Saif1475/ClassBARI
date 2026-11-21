import type { Page } from "@playwright/test";
import { deflateRawSync } from "node:zlib";
import { expect, loginAs, test } from "./helpers";

/** A minimal real .docx with one paragraph per line. */
function docx(lines: string[]) {
  const xml = `<w:document><w:body>${lines.map((l) => `<w:p><w:r><w:t xml:space="preserve">${l.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`;
  const data = deflateRawSync(Buffer.from(xml)), n = Buffer.from("word/document.xml");
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt16LE(n.length, 26);
  const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10); c.writeUInt32LE(data.length, 20); c.writeUInt16LE(n.length, 28);
  const cd = Buffer.concat([c, n]), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(30 + n.length + data.length, 16);
  return Buffer.concat([local, n, data, cd, end]);
}

const newQuiz = async (page: Page, title: string) => {
  await loginAs(page, "teacher");
  await page.goto("/teacher");
  await page.getByRole("button", { name: "Course studio" }).first().click();
  await page.locator("aside").getByRole("button", { name: /Tests & exams/ }).click();
  await page.getByRole("button", { name: "New quiz" }).click();
  await page.getByLabel("Title").fill(title);
};
const openAsStudent = async (page: Page, title: string) => {
  await loginAs(page, "student");
  await page.goto("/student");
  await page.getByRole("button", { name: "My class" }).first().click();
  await page.getByRole("button", { name: new RegExp(title) }).first().click();
};

test("import MCQs from a Word file; a missing answer is flagged before publishing", async ({ page }) => {
  await newQuiz(page, "Imported from Word");
  const file = docx(["1. Unit of force?", "a) Joule", "b) Newton", "Answer: b", "2. Unit of power?", "a) Watt    b) Volt", ""]);
  await page.getByLabel("Import questions from a file").setInputFiles({ name: "questions.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: file });
  await expect(page.getByText("2 questions added below")).toBeVisible();
  await expect(page.getByText("Mark the right answer with * for question 2.")).toBeVisible();
  const box = page.getByRole("textbox", { name: /^Questions/ });
  await expect(box).toHaveValue("Unit of force?\nJoule\n*Newton\n\nUnit of power?\nWatt\nVolt");
  await box.fill((await box.inputValue()).replace("Watt\nVolt", "*Watt\nVolt"));
  await page.getByRole("button", { name: "Publish item" }).click();
  await openAsStudent(page, "Imported from Word");
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByText("Unit of power?")).toBeVisible();
});

test("import from Excel/CSV", async ({ page }) => {
  await newQuiz(page, "From Excel");
  const csv = "Question,A,B,C,D,Answer\n2+2,3,4,5,6,B\nCapital of Bangladesh,Dhaka,Delhi,,,Dhaka\n";
  await page.getByLabel("Import questions from a file").setInputFiles({ name: "q.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByText("2 questions added below")).toBeVisible();
  await expect(page.getByRole("textbox", { name: /^Questions/ })).toHaveValue("2+2\n3\n*4\n5\n6\n\nCapital of Bangladesh\n*Dhaka\nDelhi");
});

test("MCQ on an uploaded question paper with an answer key is marked automatically", async ({ page }) => {
  await newQuiz(page, "Paper test");
  await page.getByLabel("Total marks").fill("2");
  await page.getByLabel("Question paper (PDF or photo, optional)").setInputFiles("e2e/fixtures/answer.jpg");
  await page.getByLabel(/^Answer key/).fill("b a");
  await expect(page.getByText("2 answers")).toBeVisible();
  await page.getByRole("button", { name: "Publish item" }).click();
  await openAsStudent(page, "Paper test");
  await expect(page.getByText("The questions are on the question paper")).toBeVisible();
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("button", { name: /Open question paper/ })).toBeVisible();
  await page.getByRole("group", { name: /Question 1 \(see the paper\)/ }).getByText("B", { exact: true }).click();
  await page.getByRole("group", { name: /Question 2 \(see the paper\)/ }).getByText("A", { exact: true }).click();
  await page.locator("div.fixed.inset-0").getByRole("button", { name: "Submit answers" }).click();
  await expect(page.getByRole("status")).toContainText("2");
  await expect(page.getByRole("status")).toContainText("2 right · 0 wrong");
});

test("read MCQs from a photo of a printed paper (OCR)", async ({ page }) => {
  test.setTimeout(180_000); // the text reader downloads its language data the first time
  // Make a clear "photo" of a printed question paper.
  await page.setContent("<canvas id=c width=1200 height=700></canvas>");
  const png = await page.evaluate(() => {
    const c = document.getElementById("c") as HTMLCanvasElement, x = c.getContext("2d")!;
    x.fillStyle = "#fff"; x.fillRect(0, 0, 1200, 700); x.fillStyle = "#000"; x.font = "44px Arial";
    ["1. What is the unit of force?", "a) Joule", "b) Newton", "Answer: b", "2. What is the unit of power?", "a) Watt", "b) Volt", "Answer: a"].forEach((l, i) => x.fillText(l, 60, 80 + i * 78));
    return c.toDataURL("image/png").split(",")[1];
  });
  await newQuiz(page, "From a photo");
  await page.getByLabel("Import questions from a file").setInputFiles({ name: "paper.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await expect(page.getByText("2 questions added below")).toBeVisible({ timeout: 150_000 });
  const text = await page.getByRole("textbox", { name: /^Questions/ }).inputValue();
  expect(text).toMatch(/unit of force\?\nJoule\n\*Newton/);
  expect(text).toMatch(/unit of power\?\n\*Watt\nVolt/);
});

test("the question bank can import a file too", async ({ page }) => {
  await loginAs(page, "teacher");
  await page.goto("/teacher");
  await page.getByRole("button", { name: "Tools" }).first().click();
  await page.getByRole("button", { name: /^Question bank/ }).click();
  await page.getByLabel("Import questions from a file").setInputFiles({ name: "q.txt", mimeType: "text/plain", buffer: Buffer.from("1. 3 x 3 = ?\na) 6 b) 9 c) 12\nAns: b") });
  await expect(page.getByRole("textbox", { name: "Add questions to the bank" })).toHaveValue("3 x 3 = ?\n6\n*9\n12");
});

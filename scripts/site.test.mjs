// Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { isBdMobile, isGmail, normEmail } from "../src/lib/site.ts";

test("Gmail check", () => {
  for (const ok of ["nusrat.jahan@gmail.com", "A.B+edu@Gmail.com", "x1@gmail.com"]) assert.equal(isGmail(ok), true, ok);
  for (const bad of ["nusrat@yahoo.com", "@gmail.com", "a@gmail.co", "a b@gmail.com", ".a@gmail.com", "a@gmail.com.bd"]) assert.equal(isGmail(bad), false, bad);
  assert.equal(normEmail("  Nusrat.Jahan@GMAIL.com "), "nusrat.jahan@gmail.com");
});

test("BD mobile check", () => {
  for (const ok of ["01712345678", "01712-345678", "+8801712345678"]) assert.equal(isBdMobile(ok), true, ok);
  for (const bad of ["0171234567", "02712345678", "1712345678"]) assert.equal(isBdMobile(bad), false, bad);
});

test("enrolment rules", async () => {
  const { validateStudent } = await import("../src/lib/site.ts");
  const existing = [{ id: 1, email: "nusrat.jahan@gmail.com", guardianEmail: "kamal.jahan@gmail.com" }];
  const ok = { name: "Ayaan", email: "ayaan@gmail.com", guardianName: "Kamal", guardianEmail: "Kamal.Jahan@gmail.com", phone: "01711234511" };
  assert.deepEqual(validateStudent(ok, existing), {}, "siblings share a guardian Gmail");
  assert.equal(validateStudent({ ...ok, email: "NUSRAT.JAHAN@gmail.com" }, existing).email, "emailTaken");
  assert.equal(validateStudent({ ...ok, email: "kamal.jahan@gmail.com" }, existing).email, "emailTaken", "a guardian's Gmail can't be a student's");
  assert.equal(validateStudent({ ...ok, guardianEmail: "nusrat.jahan@gmail.com" }, existing).guardianEmail, "guardianIsStudent");
  assert.equal(validateStudent({ ...ok, guardianEmail: "ayaan@gmail.com" }, existing).guardianEmail, "sameEmail");
  assert.equal(validateStudent({ ...ok, email: "ayaan@yahoo.com" }, existing).email, "gmailInvalid");
  assert.equal(validateStudent({ ...ok, name: " ", phone: "123" }, existing).name, "nameRequired");
  assert.equal(validateStudent({ ...ok, studentPhone: "999" }, existing).studentPhone, "studentPhoneInvalid");
  assert.deepEqual(validateStudent({ ...ok, email: "nusrat.jahan@gmail.com" }, existing, 1), {}, "editing yourself is fine");
});

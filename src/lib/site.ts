// Contact details come from .env.local so the real numbers live in one place (see README).
export const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? ""; // e.g. 8801712345678
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "";

/** wa.me link for a Bangladeshi number in any common format (01712-345678, +8801712345678…). */
export function waLink(phone: string, text?: string) {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("01")) digits = "88" + digits;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** A Gmail address (students and guardians sign in with Google). */
export const isGmail = (email: string) => /^(?!.*\.\.)[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?@gmail\.com$/i.test(email.trim()); // no ".." (Gmail refuses it)
export const normEmail = (email: string) => email.trim().toLowerCase();
/** The inbox a Gmail address reaches: Gmail ignores dots and anything after "+" (a.b+x@ is ab@). For "already used" checks. */
export const inbox = (email: string) => normEmail(email).replace(/^([^@]+)@gmail\.com$/, (_, local: string) => `${local.split("+")[0].replace(/\./g, "")}@gmail.com`);

/** The name to greet someone by: the first word, skipping a leading "Md."/"Mst." (so "Md. Rahim Uddin" is "Rahim", not "Md."). */
export const firstName = (name: string) => { const w = name.trim().split(/\s+/); return (w.length > 1 && /^(md|mst)\.?$/i.test(w[0]) ? w[1] : w[0]) ?? ""; };
/** Valid BD mobile: 01[3-9] + 8 digits, optional +88 / 88 prefix. */
export const isBdMobile = (phone: string) => /^(?:\+?88)?01[3-9]\d{8}$/.test(phone.replace(/[\s-]/g, ""));

export type StudentContact = { name: string; email: string; guardianName: string; guardianEmail: string; phone: string; studentPhone?: string };
export type EnrolError =
  | "nameRequired"
  | "gmailInvalid"
  | "emailTaken"
  | "sameEmail"
  | "guardianNameRequired"
  | "guardianGmailInvalid"
  | "guardianIsStudent"
  | "phoneInvalid"
  | "studentPhoneInvalid";

/**
 * Enrolment rules. A student's Gmail opens only their own student panel, and a guardian's Gmail opens the
 * parent panel, so each address must point to exactly one role. Siblings may share a guardian Gmail.
 */
export function validateStudent(
  s: StudentContact,
  existing: { id: number; email: string; guardianEmail: string }[],
  exceptId?: number,
): Partial<Record<keyof StudentContact, EnrolError>> {
  const others = existing.filter((x) => x.id !== exceptId);
  const email = normEmail(s.email);
  const guardianEmail = normEmail(s.guardianEmail);
  const errors: Partial<Record<keyof StudentContact, EnrolError>> = {};
  if (!s.name.trim()) errors.name = "nameRequired";
  if (!isGmail(email)) errors.email = "gmailInvalid";
  else if (others.some((x) => inbox(x.email) === inbox(email) || inbox(x.guardianEmail) === inbox(email))) errors.email = "emailTaken";
  if (!s.guardianName.trim()) errors.guardianName = "guardianNameRequired";
  if (!isGmail(guardianEmail)) errors.guardianEmail = "guardianGmailInvalid";
  else if (inbox(guardianEmail) === inbox(email)) errors.guardianEmail = "sameEmail";
  else if (others.some((x) => inbox(x.email) === inbox(guardianEmail))) errors.guardianEmail = "guardianIsStudent";
  if (!isBdMobile(s.phone)) errors.phone = "phoneInvalid";
  if (s.studentPhone?.trim() && !isBdMobile(s.studentPhone)) errors.studentPhone = "studentPhoneInvalid";
  return errors;
}

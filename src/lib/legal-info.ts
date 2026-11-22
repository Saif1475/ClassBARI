// The facts the privacy policy and terms need, in one place. Fill these in once the company is registered and
// Nion has approved the text; while any value still has [square brackets], the pages show a "draft" notice.
export const LEGAL = {
  company: "[COMPANY NAME]",
  address: "[registered address]",
  licence: "[trade licence number]",
  email: "[support email]",
  whatsapp: "[WhatsApp number]",
  updated: "[date of publishing]",
  minAge: "13",
  closedAccountDays: "90",
  replyDays: "30",
  breachHours: "72",
  hosting: "[hosting provider and region]",
  emailSender: "[email sender]",
  court: "Dhaka",
} as const;

/** True while any value above is still a [placeholder]. */
export const legalIsDraft = () => Object.values(LEGAL).some((v) => v.includes("["));

/** The text with {company}, {email}… filled in from LEGAL. */
export const fillLegal = (text: string) => text.replace(/\{(\w+)\}/g, (all, k: string) => (k in LEGAL ? LEGAL[k as keyof typeof LEGAL] : all));

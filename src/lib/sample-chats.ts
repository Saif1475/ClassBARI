// Example AI chats so the side panel (topic folders, search) can be tried before any AI key is set.
// Shown only in the demo site and for the test student made by `npm run test:accounts`, and only while they have no chats.
import { topicOf } from "./chat-topics.ts";

export const SAMPLE_STUDENT = "cb.s@gmail.com"; // same as STUDENT in scripts/test-accounts.mjs

const QA: [string, string][] = [
  ["Explain Newton's second law with an example", "**Newton's second law:** the force on a body equals its mass times its acceleration.\n\n**F = m × a**\n\nExample: you push a 2 kg trolley and it speeds up by 3 m/s every second.\n- m = 2 kg, a = 3 m/s²\n- F = 2 × 3 = **6 N**\n\nSo a heavier trolley needs more force for the same speed-up."],
  ["তরঙ্গের বেগ কীভাবে বের করব?", "তরঙ্গের বেগ বের করার সূত্র:\n\n**v = f × λ**\n- v = তরঙ্গের বেগ (m/s)\n- f = কম্পাঙ্ক (Hz)\n- λ = তরঙ্গদৈর্ঘ্য (m)\n\nউদাহরণ: f = 50 Hz, λ = 2 m হলে v = 50 × 2 = **100 m/s**।"],
  ["integrate x sin x", "Use **integration by parts**: ∫u dv = uv − ∫v du\n\n1. u = x, so du = dx\n2. dv = sin x dx, so v = −cos x\n3. ∫x sin x dx = −x cos x + ∫cos x dx\n\n**Answer:** −x cos x + sin x + C"],
  ["Solve the equation 2x² − 5x + 3 = 0", "Factor it: 2x² − 5x + 3 = (2x − 3)(x − 1)\n\nSo 2x − 3 = 0 or x − 1 = 0\n\n**x = 3/2 or x = 1**\n\nCheck x = 1: 2 − 5 + 3 = 0 ✓"],
  ["Balance this reaction: Fe + O2 → Fe2O3", "Count each atom on both sides, then adjust:\n\n**4Fe + 3O₂ → 2Fe₂O₃**\n\n- Fe: 4 on the left, 2 × 2 = 4 on the right ✓\n- O: 3 × 2 = 6 on the left, 2 × 3 = 6 on the right ✓"],
  ["How does photosynthesis work?", "Plants make their own food from light.\n\n**6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂** (with sunlight and chlorophyll)\n\n1. **Light reaction** (in the thylakoids): light splits water and gives off oxygen.\n2. **Dark reaction / Calvin cycle** (in the stroma): carbon dioxide is turned into glucose."],
  ["Change to passive voice: The teacher praised the students.", "**The students were praised by the teacher.**\n\nHow: the object (the students) becomes the subject, *praised* stays in the past as **were praised**, and the doer comes after **by**."],
  ["সমাস কাকে বলে? উদাহরণসহ বলো", "পরস্পর সম্পর্কযুক্ত দুই বা তার বেশি পদ মিলে একটি পদ হলে তাকে **সমাস** বলে।\n\nউদাহরণ:\n- সিংহ চিহ্নিত আসন = **সিংহাসন**\n- বিদ্যারূপ ধন = **বিদ্যাধন**\n- দেশের সেবা = **দেশসেবা**"],
  ["Make me a 7-day revision plan for my exam", "A simple 7-day plan:\n\n1. **Day 1–2:** read the chapters you find hardest; write short notes.\n2. **Day 3:** solve last year's questions.\n3. **Day 4:** formulas and definitions — make a one-page sheet.\n4. **Day 5:** a full practice test, timed.\n5. **Day 6:** fix the mistakes from day 5.\n6. **Day 7:** light revision of your notes, and sleep early."],
  ["hello", "Hi! 👋 Ask me anything about your studies — a sum, a definition, a chapter you want explained, or a study plan."],
];

/** The example chats, newest first (an hour apart). */
export function sampleChats(now = Date.now()) {
  return QA.map(([q, a], i) => ({
    id: now - 1 - i,
    title: q.slice(0, 60),
    topic: topicOf(q),
    at: now - i * 3_600_000,
    msgs: [{ role: "user" as const, content: q }, { role: "assistant" as const, content: a }],
  }));
}

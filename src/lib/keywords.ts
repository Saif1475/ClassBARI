// Picks important words and sentences from study text, without AI.
// No imports: also loaded directly by scripts/keywords.test.mjs.
//
// Keywords: words/phrases that repeat a lot, minus common filler words (English + Bangla).
// Key sentences: sentences that contain many keywords, formulas (=, ∝, →) or definitions ("is called", "বলে").

const STOP = new Set(
  (
    "a about above after again all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself just let me more most my no nor not now of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your page fig figure example eg ie etc chapter use used using one two three get given find also may must thus hence therefore " +
    "এবং ও বা কিন্তু যে যা যদি তবে তাহলে এই ওই সেই এটি এটা তার তাদের আমি আমরা তুমি তোমরা আপনি সে তারা হয় হয়ে হলে হবে ছিল আছে নেই না করে করা করতে কর জন্য থেকে দিয়ে মধ্যে উপর নিচে সাথে সঙ্গে কোন কোনো কি কী কেন কিভাবে কীভাবে একটি একটা এক দুই তিন যেমন অর্থাৎ সুতরাং অতএব পৃষ্ঠা অধ্যায় চিত্র"
  ).split(/\s+/),
);

/** Words in reading order (Bangla vowel signs \p{M} stay attached to their letters). */
const words = (text: string) => (text.toLowerCase().match(/[\p{L}\p{M}][\p{L}\p{M}\p{N}'’-]*/gu) ?? []).map((w) => w.replace(/['’-]+$/, ""));
const useful = (w: string) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w);

export type Keyword = { term: string; score: number };

export function extractKeywords(text: string, limit = 15): Keyword[] {
  const ws = words(text);
  const uni = new Map<string, number>();
  const bi = new Map<string, number>();
  ws.forEach((w, i) => {
    if (!useful(w)) return;
    uni.set(w, (uni.get(w) ?? 0) + 1);
    const next = ws[i + 1];
    if (next && useful(next)) bi.set(`${w} ${next}`, (bi.get(`${w} ${next}`) ?? 0) + 1);
  });
  // Phrases count only if they repeat; they score a bit higher than single words.
  const phrases = [...bi].filter(([, c]) => c >= 2).map(([term, c]) => ({ term, score: c * 1.5 }));
  const singles = [...uni]
    .filter(([w, c]) => c >= 2 && !phrases.some((p) => p.term.split(" ").includes(w) && p.score >= c))
    .map(([term, c]) => ({ term, score: c }));
  return [...phrases, ...singles].sort((a, b) => b.score - a.score || a.term.localeCompare(b.term)).slice(0, limit);
}

const FORMULA = /[=∝→≈≤≥]|\b[a-z]\s*\/\s*[a-z]\b/i;
const DEFINITION = /\b(is called|are called|is defined as|is known as|means|refers to|definition|formula|law|principle|theorem|note that|important)\b|বলে|বলা হয়|সংজ্ঞা|সূত্র|নিয়ম|সূত্রটি|গুরুত্বপূর্ণ/i;

/** The most important sentences, in the order they appear. */
export function keySentences(text: string, keywords: Keyword[], limit = 6): string[] {
  const sentences = text
    .split(/(?<=[.!?।])\s+|\n{2,}|\n(?=[A-Zঀ-৿•\-–\d])/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 15 && s.length <= 320);
  const scored = sentences.map((s, i) => {
    const lower = s.toLowerCase();
    // Distinct keywords matched (so overlapping phrases don't double count), plus formula/definition bonus.
    const kw = keywords.filter((k) => lower.includes(k.term)).length;
    return { s, i, score: kw + (FORMULA.test(s) ? 2 : 0) + (DEFINITION.test(s) ? 2 : 0) };
  });
  const seen = new Set<string>();
  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .filter((x) => !seen.has(x.s) && seen.add(x.s))
    .slice(0, limit)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.s);
}

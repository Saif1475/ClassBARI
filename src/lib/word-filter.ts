// Community text check: abusive or sexual words in English, Bangla and "Banglish" (Bangla typed in English letters).
// A student's post with such words waits for a teacher (like a flagged photo); a reply, an edit or a bio is not accepted.
// shortcut: a word list, so it misses new slang and clever spellings; teachers and the Report button remain the backstop.

// Whole words (after tidying up the spelling).
const WORDS = new Set(
  (
    "fuck fucker fucking fuk fck fack phuck sht btch shit bullshit bitch bastard asshole arsehole dick dickhead pussy slut whore cunt nigger nigga faggot retard porn porno nude nudes xxx rape rapist wanker motherfucker stfu kys " +
    "magi khanki khankir chod choda chodi chudi chuda chudir chudbo sala shala salar harami haramjada haramzada kutta kuttar shuor shuorer suorer madarchod madarchot bokachoda bokachod beshya noti voda vuda dhon bal baal baler bainchod banchod lawra lewra gandu " +
    "মাগি মাগী খানকি খানকির চুদি চুদা চোদা চুদির শালা শালার হারামি হারামজাদা কুত্তা কুত্তার শুয়োর শুয়োরের মাদারচোদ বোকাচোদা বেশ্যা নটি ভোদা ধোন বাল বালের বাইনচোদ লেওড়া গান্ডু"
  ).split(/\s+/),
);
// Starts of words that are bad whatever follows ("fuckkk", "চুদিরভাই").
const STEMS = ["fuck", "motherf", "madarch", "bokach", "khanki", "চুদ", "চোদ", "খানকি", "মাদারচো", "বোকাচো"];
const PHRASES = ["kill yourself", "go die", "kuttar baccha", "kuttar bacha", "shuorer baccha", "কুত্তার বাচ্চা", "শুয়োরের বাচ্চা", "মরে যা"];

/** Lower case, common letter swaps undone (f@ck, sh1t), and stretched letters shortened (fuuuck). */
const tidy = (text: string) =>
  text
    .toLowerCase()
    .replace(/[@4]/g, "a")
    .replace(/[1!|]/g, "i")
    .replace(/0/g, "o")
    .replace(/[$5]/g, "s")
    .replace(/3/g, "e")
    .replace(/(?<=\p{L})[*#._-]+(?=\p{L})/gu, "") // f*ck, f.u.c.k
    .replace(/(\p{L})\1{2,}/gu, "$1");

/** Does this text contain abusive or sexual words? */
export function unkind(text: string): boolean {
  const t = tidy(text);
  if (PHRASES.some((p) => t.includes(p))) return true;
  const tokens = t.match(/[\p{L}\p{M}]+/gu) ?? [];
  return tokens.some((w) => WORDS.has(w) || WORDS.has(w.replace(/(\p{L})\1+/gu, "$1")) || STEMS.some((s) => w.startsWith(s)));
}

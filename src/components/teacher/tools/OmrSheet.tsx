"use client";

import { useLang } from "@/lib/i18n/LanguageProvider";
import { BUBBLE_R, MARK, MARKS, OPTIONS, PAGE, ROLL_DIGITS, questionBubble, rollBubble, setBubble } from "@/lib/omr";

/** Printable A4 OMR answer sheet. Letters sit beside the bubbles, never inside, so empty bubbles stay white for the reader. */
export function OmrSheet({ questions, title, institute }: { questions: number; title: string; institute: string }) {
  const { t } = useLang();
  const O = t.omr;
  const ring = { r: BUBBLE_R, fill: "none", stroke: "#222", strokeWidth: 0.3 };
  return (
    <svg viewBox={`0 0 ${PAGE.w} ${PAGE.h}`} width="210mm" height="297mm" className="mx-auto block max-w-full bg-white print:max-w-none" role="img" aria-label={O.sheet}>
      <style>{"@page { size: A4; margin: 0 } text { font-family: sans-serif }"}</style>
      {MARKS.map(([x, y], i) => <rect key={i} x={x} y={y} width={MARK} height={MARK} fill="#000" />)}
      <text x={24} y={26} fontSize={6} fontWeight="bold">{institute}</text>
      <text x={24} y={33} fontSize={4.5}>{title}</text>
      <text x={24} y={42} fontSize={3.6}>{O.nameLine}</text>
      <text x={120} y={26} fontSize={2.8}>{O.rule1}</text>
      <text x={120} y={30} fontSize={2.8}>{O.rule2}</text>
      <text x={120} y={34} fontSize={2.8}>{O.rule3}</text>
      <text x={20} y={51} fontSize={3.2} fontWeight="bold">{O.roll}</text>
      {[...Array(ROLL_DIGITS)].map((_, col) => (
        <rect key={col} x={rollBubble(col, 0).x - 3} y={52} width={6} height={4} fill="none" stroke="#222" strokeWidth={0.3} />
      ))}
      {[...Array(10).keys()].map((d) => (
        <g key={d}>
          <text x={17} y={rollBubble(0, d).y + 1.2} fontSize={3}>{d}</text>
          {[...Array(ROLL_DIGITS)].map((_, col) => <circle key={col} cx={rollBubble(col, d).x} cy={rollBubble(col, d).y} {...ring} />)}
        </g>
      ))}
      <text x={78} y={51} fontSize={3.2} fontWeight="bold">{O.set}</text>
      {OPTIONS.map((o, k) => (
        <g key={o}>
          <circle cx={setBubble(k).x} cy={setBubble(k).y} {...ring} />
          <text x={setBubble(k).x - 1.1} y={setBubble(k).y - 3.3} fontSize={2.8}>{o}</text>
        </g>
      ))}
      {[...Array(Math.ceil(questions / 25))].map((_, c) => (
        <g key={c}>
          {OPTIONS.map((o, k) => <text key={o} x={questionBubble(c * 25, k).x - 1.1} y={123} fontSize={2.8} fontWeight="bold">{o}</text>)}
        </g>
      ))}
      {[...Array(questions).keys()].map((q) => (
        <g key={q}>
          <text x={questionBubble(q, 0).x - 9} y={questionBubble(q, 0).y + 1.1} fontSize={3}>{q + 1}.</text>
          {OPTIONS.map((o, k) => <circle key={o} cx={questionBubble(q, k).x} cy={questionBubble(q, k).y} {...ring} />)}
        </g>
      ))}
      <text x={105} y={286} fontSize={2.5} textAnchor="middle" fill="#666">ClassBARI OMR · {questions}</text>
    </svg>
  );
}

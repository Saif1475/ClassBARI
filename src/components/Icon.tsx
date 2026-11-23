// Instanton Campus's own icons (src/lib/icon-set.ts): a 24×24 stroke set with the "bari corner" and one quiet accent.
import { glyph } from "@/lib/icon-set";

export function Icon({ name, size = 22, className = "", strokeWidth = 1.8 }: { name: string; size?: number; className?: string; strokeWidth?: number }) {
  const g = glyph(name);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {g?.a?.map((d, i) => <path key={`a${i}`} d={d} fill="currentColor" fillOpacity={0.18} stroke="none" />)}
      {g?.s.map((d, i) => <path key={`s${i}`} d={d} />)}
      {g?.f?.map((d, i) => <path key={`f${i}`} d={d} fill="currentColor" stroke="none" />)}
    </svg>
  );
}

export function PlayIcon({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M8.5 5.6Q8.5 4.4 9.6 5L18.6 11Q19.6 12 18.6 13L9.6 19Q8.5 19.6 8.5 18.4Z" />
    </svg>
  );
}

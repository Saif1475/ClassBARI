import { WhenReady } from "@/lib/lms-store";

// Like /teacher: wait for the saved data, so the page never shows build-time dates (would mismatch after midnight).
export default function InstituteLayout({ children }: { children: React.ReactNode }) {
  return <WhenReady>{children}</WhenReady>;
}

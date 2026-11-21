import { WhenReady } from "@/lib/lms-store";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return <WhenReady>{children}</WhenReady>;
}

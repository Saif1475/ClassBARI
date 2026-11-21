import { WhenReady } from "@/lib/lms-store";

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return <WhenReady>{children}</WhenReady>;
}

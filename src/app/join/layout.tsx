import type { ReactNode } from "react";
import { PublicData } from "@/lib/lms-store";

export default function Layout({ children }: { children: ReactNode }) {
  return <PublicData>{children}</PublicData>;
}

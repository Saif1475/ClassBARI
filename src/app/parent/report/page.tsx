"use client";

import { ReportCard } from "@/components/ReportCard";
import { useChild } from "../child";

export default function ParentReport() {
  const { child } = useChild();
  return child ? <ReportCard key={child.id} studentId={child.id} /> : null;
}

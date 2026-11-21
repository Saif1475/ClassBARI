"use client";

import { Invoice } from "@/components/Invoice";
import { useChild } from "../child";

export default function ParentInvoice() {
  const { child } = useChild();
  return child ? <Invoice studentId={child.id} /> : null;
}

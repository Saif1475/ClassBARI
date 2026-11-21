"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Loading } from "@/components/Loading";
import { Icon } from "@/components/Icon";
import { useLang } from "@/lib/i18n/LanguageProvider";

// Each tool's code is fetched when the tool is opened, not with the whole dashboard.
const AdmissionsTool = dynamic(() => import("./AdmissionsTool").then((m) => m.AdmissionsTool), { loading: () => <Loading /> });
const BankTool = dynamic(() => import("./BankTool").then((m) => m.BankTool), { loading: () => <Loading /> });
const CardsTool = dynamic(() => import("./CardsTool").then((m) => m.CardsTool), { loading: () => <Loading /> });
const DoubtsTool = dynamic(() => import("./DoubtsTool").then((m) => m.DoubtsTool), { loading: () => <Loading /> });
const MeetingsTool = dynamic(() => import("./MeetingsTool").then((m) => m.MeetingsTool), { loading: () => <Loading /> });
const MeritTool = dynamic(() => import("./MeritTool").then((m) => m.MeritTool), { loading: () => <Loading /> });
const MoneyTool = dynamic(() => import("./MoneyTool").then((m) => m.MoneyTool), { loading: () => <Loading /> });
const OmrTool = dynamic(() => import("./OmrTool").then((m) => m.OmrTool), { loading: () => <Loading /> });
const RoutineTool = dynamic(() => import("./RoutineTool").then((m) => m.RoutineTool), { loading: () => <Loading /> });
const ShopTool = dynamic(() => import("./ShopTool").then((m) => m.ShopTool), { loading: () => <Loading /> });
const StaffTool = dynamic(() => import("./StaffTool").then((m) => m.StaffTool), { loading: () => <Loading /> });
const WatchTool = dynamic(() => import("./WatchTool").then((m) => m.WatchTool), { loading: () => <Loading /> });
const WebsiteTool = dynamic(() => import("./WebsiteTool").then((m) => m.WebsiteTool), { loading: () => <Loading /> });
const WhiteboardTool = dynamic(() => import("./WhiteboardTool").then((m) => m.WhiteboardTool), { loading: () => <Loading /> });
const Community = dynamic(() => import("@/components/community/Community").then((m) => m.Community), { loading: () => <Loading /> });

export type ToolProps = { batchNames: string[]; notify: (msg: string) => void };
const TOOLS = {
  classroom: { icon: "sparkle", C: WhiteboardTool },
  merit: { icon: "award", C: MeritTool },
  omr: { icon: "exams", C: OmrTool },
  bank: { icon: "book", C: BankTool },
  cards: { icon: "printer", C: CardsTool },
  doubts: { icon: "message", C: DoubtsTool },
  community: { icon: "users", C: () => <Community viewer={{ staff: true }} /> },
  watch: { icon: "eye", C: WatchTool },
  routine: { icon: "calendar", C: RoutineTool },
  money: { icon: "fees", C: MoneyTool },
  admissions: { icon: "users", C: AdmissionsTool },
  staff: { icon: "batches", C: StaffTool },
  meetings: { icon: "share", C: MeetingsTool },
  website: { icon: "globe", C: () => <WebsiteTool /> },
  shop: { icon: "star", C: ShopTool },
} satisfies Record<string, { icon: string; C: React.ComponentType<ToolProps> }>;
export type ToolId = keyof typeof TOOLS;

/** Teacher "Tools": one big card per tool (easy to find for older teachers), each opening its own screen. */
const OWNER_ONLY: string[] = ["money", "website", "shop", "admissions", "staff"]; // institute-only tools: hidden from instructors

export function ToolsPage({ owner, ...props }: ToolProps & { owner: boolean }) {
  const { t } = useLang();
  const T = t.tools;
  const [open, setOpen] = useState<ToolId | null>(null);
  const Tool = open && TOOLS[open].C;
  return (
    <main className="flex min-w-0 flex-1 flex-col gap-5 px-4 pb-28 pt-4 md:overflow-y-auto md:px-8 md:pb-10 md:pt-6 [&>*]:shrink-0">
      {Tool ? (
        <>
          <button type="button" onClick={() => setOpen(null)} className="inline-flex items-center gap-1 self-start rounded-full bg-surface-container px-4 py-2 text-sm font-bold text-primary">
            <Icon name="back" size={16} /> {T.all}
          </button>
          <h1 className="text-3xl font-bold">{T.names[open!][0]}</h1>
          <Tool {...props} />
        </>
      ) : (
        <>
          <div>
            <h1 className="text-3xl font-bold">{T.title}</h1>
            <p className="mt-1 text-sm text-on-surface-variant">{T.sub}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(Object.keys(TOOLS) as ToolId[]).filter((id) => owner || !OWNER_ONLY.includes(id)).map((id) => (
              <button key={id} type="button" onClick={() => setOpen(id)} className="flex items-start gap-4 rounded-[18px] border border-outline-variant bg-white p-5 text-left transition-transform hover:-translate-y-0.5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-container text-on-primary-container">
                  <Icon name={TOOLS[id].icon} size={24} />
                </span>
                <span className="flex flex-col gap-1">
                  <span className="text-lg font-bold">{T.names[id][0]}</span>
                  <span className="text-sm text-on-surface-variant">{T.names[id][1]}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </main>
  );
}

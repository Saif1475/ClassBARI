"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Logo, LangSwitch } from "@/components/Brand";
import { useFlag } from "@/components/Platform";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { CONTACT_EMAIL, WHATSAPP_NUMBER, isBdMobile, waLink } from "@/lib/site";

const featureIcons = ["batches", "video", "fees", "exams", "message", "sparkle"];
const featureTones = [
  "bg-primary-container text-on-primary-container",
  "bg-secondary-container text-on-secondary-container",
  "bg-tertiary-container text-on-tertiary-container",
  "bg-secondary-container text-on-secondary-container",
  "bg-tertiary-container text-on-tertiary-container",
  "bg-primary-container text-on-primary-container",
];
const featureShapes = ["rounded-[24px]", "rounded-[40px_40px_40px_12px]", "rounded-[24px]", "rounded-[12px_40px_40px_40px]", "rounded-[24px]", "rounded-[40px_12px_40px_40px]"];

export default function LandingPage() {
  const { t } = useLang();
  const L = t.landing;
  const coursesOn = useFlag("publicCourses");
  const [size, setSize] = useState(0);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error" | "badPhone">("idle");
  const whatsapp = WHATSAPP_NUMBER && waLink(WHATSAPP_NUMBER);
  const contactHref = CONTACT_EMAIL ? `mailto:${CONTACT_EMAIL}` : whatsapp || "#teachers";

  const sendLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isBdMobile(phone)) return setStatus("badPhone");
    setStatus("sending");
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, size: L.sizes[size] }),
      });
      setStatus(res.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="min-h-dvh overflow-x-clip bg-surface">
      {/* Top app bar */}
      <header className="sticky top-0 z-30 border-b border-outline-variant bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-3.5">
          <Logo />
          <nav aria-label="Main" className="hidden gap-1 md:flex">
            {[
              ["#features", L.navFeatures],
              ["#toolkit", L.navToolkit],
              ["#teachers", L.navTeachers],
              ["#faq", L.navFaq],
            ].map(([href, label]) => (
              <a key={href} href={href} className="rounded-full px-4 py-2.5 font-medium text-on-surface-variant hover:bg-surface-container">
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <LangSwitch compact />
            {coursesOn && <Link href="/courses" className="hidden rounded-full px-4 py-3 font-semibold text-on-surface-variant hover:bg-surface-container sm:inline-block">
              {t.courses.nav}
            </Link>}
            <Link href="/login" className="rounded-full px-5 py-3 font-semibold text-primary hover:bg-surface-container">
              {t.common.logIn}
            </Link>
            <a href="#teachers" className="hidden rounded-full bg-primary px-6 py-3 font-semibold text-on-primary sm:inline-block">
              {L.startFree}
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section id="top" className="mx-auto flex max-w-6xl flex-wrap items-center gap-12 px-6 pb-14 pt-16 md:pt-20">
        <div className="flex min-w-0 flex-[1_1_460px] flex-col gap-6">
          <span className="inline-flex items-center gap-2 self-start rounded-full bg-tertiary-container px-4 py-2 text-[15px] font-semibold text-on-tertiary-container">
            <Icon name="star" size={18} strokeWidth={2} />
            {L.badge}
          </span>
          <h1 className="text-5xl font-bold leading-[1.1] tracking-tight md:text-6xl">
            {L.heroTitle} <span className="text-primary">{L.heroTitleAccent}</span>
          </h1>
          <p className="max-w-xl text-xl leading-relaxed text-on-surface-variant">{L.heroSub}</p>
          <div className="flex flex-wrap gap-3">
            <a href="#teachers" className="inline-flex items-center gap-2.5 rounded-full bg-primary px-8 py-4 text-lg font-semibold text-on-primary">
              {L.startFree} <Icon name="arrow" size={20} strokeWidth={2.2} />
            </a>
            <Link href="/student" className="inline-flex items-center gap-2.5 rounded-full bg-secondary-container px-7 py-4 text-lg font-semibold text-on-secondary-container">
              <Icon name="video" size={20} /> {L.watchDemo}
            </Link>
          </div>
          <p className="text-sm text-on-surface-variant">{L.heroNote}</p>
        </div>

        {/* Expressive visual */}
        <div className="relative flex min-w-0 flex-[1_1_420px] justify-center">
          <div className="absolute inset-0 m-auto h-[440px] w-[440px] max-w-full rounded-[160px_48px_160px_48px] bg-primary-container" />
          <div className="absolute right-6 top-2 h-24 w-24 rounded-full bg-tertiary-container" />
          <div className="relative my-8 w-[300px] rounded-[24px] bg-white p-5 shadow-[0_20px_50px_rgba(0,32,28,0.18)]">
            <div className="flex items-center justify-between">
              <span className="text-sm text-on-surface-variant">{L.todaysClass}</span>
              <span className="rounded-full bg-error-container px-2.5 py-1 text-xs font-bold text-on-error-container">● {L.live} 4:30</span>
            </div>
            <div className="mt-2 text-lg font-bold">HSC Physics — Batch A</div>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <div className="rounded-2xl bg-secondary-container p-3.5 text-on-secondary-container">
                <div className="text-xs capitalize">{t.common.students}</div>
                <div className="text-2xl font-extrabold">48</div>
              </div>
              <div className="rounded-2xl bg-tertiary-container p-3.5 text-on-tertiary-container">
                <div className="text-xs">{L.feesDue}</div>
                <div className="text-2xl font-extrabold">6</div>
              </div>
            </div>
            <ul className="mt-4 flex flex-col gap-2">
              {[
                ["R", "Rafi Ahmed", true],
                ["N", "Nusrat Jahan", false],
              ].map(([i, n, ok]) => (
                <li key={n as string} className="flex items-center gap-2.5 rounded-xl bg-surface px-3 py-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-container text-sm font-bold text-on-primary-container">{i}</span>
                  <span className="flex-1 text-sm font-semibold">{n}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ok ? "bg-secondary-container text-on-secondary-container" : "bg-tertiary-container text-on-tertiary-container"}`}>
                    {ok ? t.common.paid : t.common.due}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="absolute -left-2 -bottom-2 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_10px_30px_rgba(0,32,28,0.15)] md:left-0">
            <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-bkash text-xs font-extrabold text-white">b</span>
            <span className="flex flex-col">
              <span className="text-sm font-bold">{L.feeReceived}</span>
              <span className="text-xs text-on-surface-variant">৳1,200 · Rafi Ahmed</span>
            </span>
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="mx-auto max-w-6xl px-6 py-12">
        <h2 className="text-4xl font-bold">{L.stepsTitle}</h2>
        <p className="mt-2 text-lg text-on-surface-variant">{L.stepsSub}</p>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {L.steps.map((s, i) => (
            <div key={s.title} className="flex flex-col gap-3 rounded-[20px] border border-outline-variant bg-white p-7">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-xl font-extrabold text-on-primary">{i + 1}</span>
              <h3 className="text-xl font-bold">{s.title}</h3>
              <p className="leading-relaxed text-on-surface-variant">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-12">
        <h2 className="text-4xl font-bold">{L.featuresTitle}</h2>
        <p className="mt-2 text-lg text-on-surface-variant">{L.featuresSub}</p>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {L.features.map((f, i) => (
            <div key={f.title} className={`flex flex-col gap-3 p-8 ${featureTones[i]} ${featureShapes[i]}`}>
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/70">
                <Icon name={featureIcons[i]} size={24} />
              </span>
              <h3 className="text-xl font-bold">{f.title}</h3>
              <p className="leading-relaxed opacity-90">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Toolkit */}
      <section id="toolkit" className="scroll-mt-20 bg-deep px-6 py-14">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-4xl font-bold text-white">{L.toolkitTitle}</h2>
              <p className="mt-2 max-w-2xl text-lg text-secondary-container">{L.toolkitSub}</p>
            </div>
            <span className="rounded-full bg-tertiary-container px-4 py-2.5 text-[15px] font-semibold text-on-tertiary-container">{L.toolkitBadge}</span>
          </div>
          <div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-2">
            {L.kits.map((k, i) => {
              const hot = i === 1;
              return (
                <div key={k.name} className={`flex flex-col gap-4 rounded-[24px] p-8 ${hot ? "bg-primary-container md:-translate-y-2" : "bg-[#eef7f4]"}`}>
                  {hot && <span className="self-start rounded-full bg-primary px-3 py-1 text-xs font-bold text-on-primary">{L.popular}</span>}
                  <span className={`text-lg font-bold ${hot ? "text-on-primary-container" : "text-primary"}`}>{k.name}</span>
                  <ul className="list-disc pl-5 leading-loose text-on-surface-variant">
                    {k.items.map((it) => (
                      <li key={it}>{it}</li>
                    ))}
                  </ul>
                  <a href="#teachers" className={`mt-auto rounded-full px-5 py-3.5 text-center font-semibold ${hot ? "bg-primary text-on-primary" : "bg-secondary-container text-on-secondary-container"}`}>
                    {L.contactPrice}
                  </a>
                </div>
              );
            })}
          </div>
          <p className="mt-6 text-sm text-secondary-container">{L.toolkitNote}</p>
        </div>
      </section>

      {/* Teachers enquiry (no public pricing) */}
      <section id="teachers" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-16">
        <div className="grid items-center gap-10 rounded-[28px] bg-surface-container p-5 sm:p-8 md:grid-cols-2 md:rounded-[160px_48px_48px_48px] md:p-14">
          <div className="flex min-w-0 flex-col gap-4">
            <span className="self-start rounded-full bg-tertiary-container px-3.5 py-1.5 text-sm font-bold text-on-tertiary-container">{L.teachersBadge}</span>
            <h2 className="text-4xl font-bold leading-tight">{L.teachersTitle}</h2>
            <p className="text-lg leading-relaxed text-on-surface-variant">{L.teachersSub}</p>
            <ul className="flex flex-col gap-2">
              {L.teachersPoints.map((p) => (
                <li key={p} className="flex items-center gap-2 text-on-surface-variant">
                  <span className="text-primary"><Icon name="check" size={18} strokeWidth={2.4} /></span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <form className="flex min-w-0 flex-col gap-3.5 rounded-[24px] bg-white p-5 sm:p-8" onSubmit={sendLead}>
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-on-surface-variant">
              {L.formName}
              <input required maxLength={100} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder={L.formNamePh} className="h-13 rounded-xl border border-outline px-4 py-3 text-base text-on-surface outline-primary" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-on-surface-variant">
              {L.formPhone}
              <input
                required
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (status === "badPhone") setStatus("idle");
                }}
                aria-invalid={status === "badPhone"}
                placeholder="01XXXXXXXXX"
                className="h-13 rounded-xl border border-outline px-4 py-3 text-base text-on-surface outline-primary"
              />
              {status === "badPhone" && <span role="alert" className="text-error">{L.formPhoneInvalid}</span>}
            </label>
            <div className="flex flex-col gap-2 text-sm font-semibold text-on-surface-variant">
              {L.formSize}
              <div className="flex flex-wrap gap-2">
                {L.sizes.map((s, i) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={size === i}
                    onClick={() => setSize(i)}
                    className={`h-11 rounded-full px-5 text-[15px] font-semibold ${size === i ? "bg-secondary-container text-on-secondary-container" : "border border-outline text-on-surface-variant"}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <button type="submit" disabled={status === "sending" || status === "sent"} className="mt-1.5 h-14 rounded-full bg-primary text-[17px] font-bold text-on-primary disabled:opacity-80">
              {status === "sending" ? L.formSending : status === "sent" ? L.formSent : L.formSubmit}
            </button>
            {status === "error" && <span role="alert" className="text-center text-sm font-semibold text-error">{L.formError}</span>}
            <span className="text-center text-xs text-on-surface-variant">{L.formNote}</span>
          </form>
        </div>
      </section>

      {/* Testimonials: hidden until real quotes are added in en.ts / bn.ts */}
      {L.testimonials.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 py-8">
          <h2 className="mb-6 text-3xl font-bold">{L.testimonialsTitle}</h2>
          <div className="grid gap-5 md:grid-cols-3">
            {L.testimonials.map((q) => (
              <figure key={q.name} className="flex flex-col gap-4 rounded-[20px] bg-surface-container p-7">
                <blockquote className="text-lg leading-relaxed">{q.quote}</blockquote>
                <figcaption className="text-[15px] text-on-surface-variant">{q.name}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-6 py-12">
        <h2 className="mb-6 text-4xl font-bold">{L.faqTitle}</h2>
        <div className="flex flex-col gap-3">
          {L.faqs.map((f) => (
            <details key={f.q} className="group rounded-2xl border border-outline-variant bg-white px-6 py-5">
              <summary className="flex cursor-pointer items-center justify-between gap-4 text-lg font-semibold">
                {f.q}
                <span className="transition-transform group-open:rotate-180"><Icon name="chevronDown" /></span>
              </summary>
              <p className="mt-3 leading-relaxed text-on-surface-variant">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-6 rounded-[28px] bg-primary px-10 py-14 md:rounded-[48px_160px_48px_160px]">
          <div className="min-w-0 flex-[1_1_420px]">
            <h2 className="text-4xl font-bold text-white">{L.ctaTitle}</h2>
            <p className="mt-2 text-lg text-secondary-container">{L.ctaSub}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href="#teachers" className="rounded-full bg-tertiary-container px-8 py-4 text-lg font-bold text-on-tertiary-container">{L.ctaDemo}</a>
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noreferrer" className="rounded-full border border-secondary-container px-7 py-4 text-lg font-semibold text-white">
                {L.ctaWhatsapp}
              </a>
            )}
          </div>
        </div>
      </section>

      <footer className="border-t border-outline-variant">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-on-surface-variant">
          <span>{L.footer}</span>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/privacy">{L.privacy}</Link>
            <Link href="/terms">{L.terms}</Link>
            <a href={contactHref}>{L.contact}</a>
            <Link href="/support">{t.support.link}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

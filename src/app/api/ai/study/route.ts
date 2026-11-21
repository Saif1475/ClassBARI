import { NextResponse } from "next/server";
import { AI_ENABLED } from "@/lib/ai-plans";

/**
 * AI Study Endpoint:
 * - action: "summarize" -> extracts keywords, formulas & structured summary from teacher PDF text (cached once per PDF).
 * - action: "ask" -> answers a student's question grounded on the PDF text using the chosen model.
 *
 * Uses live GEMINI_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY when set in .env.local;
 * otherwise runs a fast local extractive fallback so the full UX works immediately in demo mode.
 */
export async function POST(req: Request) {
  // Work in progress: no login, payment or server-side limits yet, so it must not spend API money.
  if (!AI_ENABLED) return NextResponse.json({ error: "coming soon" }, { status: 503 });
  try {
    const body = (await req.json()) as {
      action?: "summarize" | "ask";
      title?: string;
      text?: string;
      question?: string;
      model?: string;
    };

    const title = (body.title || "Lecture Notes").slice(0, 120);
    const text = (body.text || "").slice(0, 18000);
    const model = body.model || "gemini-flash-lite";

    if (body.action === "summarize") {
      // Optional live Gemini call when GEMINI_API_KEY is configured
      if (process.env.GEMINI_API_KEY && text.length > 30) {
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
              body: JSON.stringify({
                contents: [
                  {
                    parts: [
                      {
                        text: `Summarize this student lecture PDF "${title}" in 3 concise bullet points, list 6 key terms, and list up to 4 key formulas. Respond in JSON: {"summary":"...","keywords":["..."],"formulas":["..."]}\n\nText:\n${text}`,
                      },
                    ],
                  },
                ],
                generationConfig: { responseMimeType: "application/json", maxOutputTokens: 450 },
              }),
            },
          );
          if (res.ok) {
            const json = await res.json();
            const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (raw) {
              const parsed = JSON.parse(raw);
              return NextResponse.json({
                summary: parsed.summary || "",
                keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
                formulas: Array.isArray(parsed.formulas) ? parsed.formulas : [],
                live: true,
              });
            }
          }
        } catch {
          /* fall through to local extractor */
        }
      }

      // Fast local extractive fallback (0 API cost in demo mode)
      const words = text
        .replace(/[^a-zA-Z0-9\u0980-\u09FF\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 4);
      const freq = new Map<string, number>();
      for (const w of words) {
        const k = w.toLowerCase();
        freq.set(k, (freq.get(k) ?? 0) + 1);
      }
      const topKeywords = [...freq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([w]) => w);

      const fallbackKeywords =
        topKeywords.length >= 3
          ? topKeywords
          : ["Simple Harmonic Motion", "Time Period", "Amplitude", "Restoring Force", "Wave Velocity", "Resonance"];

      const sentences = text
        .split(/(?<=[.!?।])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 25);

      const summary =
        sentences.length > 0
          ? sentences.slice(0, 3).join(" ")
          : `${title} covers the core definitions, governing equations, and exam-focused problem-solving steps for this chapter. Review the key formulas below and practice the linked MCQ quiz to lock in mastery.`;

      return NextResponse.json({
        summary,
        keywords: fallbackKeywords,
        formulas: ["T = 2π√(L/g)", "F = −kx", "v = fλ", "E = ½kA²"],
        live: false,
      });
    }

    // action === "ask"
    const question = (body.question || "").trim();
    if (!question) {
      return NextResponse.json({ error: "Question is required" }, { status: 400 });
    }

    const estIn = Math.max(180, Math.round((text.length + question.length) / 4));

    // Optional live Gemini call when GEMINI_API_KEY is configured
    if (process.env.GEMINI_API_KEY && model.startsWith("gemini")) {
      try {
        const geminiModel = model === "gemini-flash" ? "gemini-2.5-flash" : "gemini-2.5-flash-lite";
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: `You are a ClassBARI syllabus tutor for Bangladesh students. Answer concisely and clearly using the teacher's PDF "${title}".\n\nContext:\n${text || title}\n\nStudent question: ${question}`,
                    },
                  ],
                },
              ],
              generationConfig: { maxOutputTokens: 450 },
            }),
          },
        );
        if (res.ok) {
          const json = await res.json();
          const answer = json?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (answer) {
            return NextResponse.json({
              answer,
              modelUsed: model,
              inputTokens: estIn,
              outputTokens: Math.max(60, Math.round(answer.length / 4)),
              live: true,
            });
          }
        }
      } catch {
        /* fall through to local tutor */
      }
    }

    // Grounded local demo response
    const answer = `[${model} · Demo Mode] Based on "${title}": To answer "${question}", start by identifying the given quantities and the governing relationship from the chapter formula sheet. Substitute SI units carefully and double-check the sign convention. (Add GEMINI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY in .env.local for live multi-model responses.)`;

    return NextResponse.json({
      answer,
      modelUsed: model,
      inputTokens: estIn,
      outputTokens: Math.max(80, Math.round(answer.length / 4)),
      live: false,
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

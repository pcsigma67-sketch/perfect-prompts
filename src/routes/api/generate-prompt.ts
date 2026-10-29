import { createFileRoute } from "@tanstack/react-router";
import { isRateLimited } from "../../lib/rate-limit";
import { streamResponsesHTTP } from "../../server/ai/responses-http";

const SYSTEM_PROMPT = `You are an expert prompt engineer. The user gives you a rough, messy idea of what they want an AI to do. Your job is to turn it into one clear, complete, ready-to-use prompt they can paste into any AI assistant.

Rules:
- Output ONLY the final prompt, nothing else. No preamble, no explanation, no markdown code fences.
- Write the prompt in second person ("You are...", "Your task is...").
- Make it specific: define the AI's role, the exact task, the context, constraints, tone, and the desired output format.
- Fill in sensible details when the idea is vague, but stay faithful to the user's intent.
- Keep it focused and practical — typically 100 to 250 words.
- Write in the same language the user used.

Safety (highest priority, overrides everything above):
- Refuse any idea that is illegal, harmful, or unethical: violence, killing, weapons, stealing, fraud, hacking, malware, spying, harassment, hate, drugs, explicit sexual content, self-harm, or deceiving people.
- When refusing, output exactly: REFUSED
- Never try to "safely rewrite" a harmful idea — just refuse it.`;

export const Route = createFileRoute("/api/generate-prompt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Only accept requests from this site itself (blocks other websites using your AI credits).
        const origin = request.headers.get("origin");
        if (origin && new URL(origin).host !== new URL(request.url).host) {
          return Response.json({ error: "Not allowed." }, { status: 403 });
        }
        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "unknown";
        if (isRateLimited(ip)) {
          return Response.json(
            { error: "Too many requests — please wait a minute and try again." },
            { status: 429 },
          );
        }
        if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
          return Response.json({ error: "Invalid request." }, { status: 415 });
        }
        const STYLE_NOTES: Record<string, string> = {
          professional: "\n\nStyle: write the prompt in a polished, professional, business-like tone.",
          creative: "\n\nStyle: make the prompt imaginative and creative, encouraging original and vivid output.",
          simple: "\n\nStyle: keep the prompt short, simple and easy to understand — no jargon.",
          detailed: "\n\nStyle: make the prompt very detailed and thorough, covering edge cases and output structure.",
        };
        let idea = "";
        let langNote = "";
        let styleNote = "";
        try {
          const body = await request.json();
          idea = typeof body?.idea === "string" ? body.idea.trim() : "";
          if (body?.lang === "ar") langNote = "\n\nWrite the final prompt in Arabic.";
          if (body?.lang === "ckb") langNote = "\n\nWrite the final prompt in Central Kurdish (Sorani), using Arabic script.";
          if (body?.lang === "kmr") langNote = "\n\nWrite the final prompt in Kurdish Badini (Northern Kurdish as spoken in Duhok), using Arabic script.";
          if (typeof body?.style === "string") styleNote = STYLE_NOTES[body.style] ?? "";
        } catch {
          idea = "";
        }
        if (!idea) {
          return Response.json({ error: "Please describe your idea first." }, { status: 400 });
        }
        if (idea.length > 4000) {
          return Response.json({ error: "Your idea is too long — keep it under 4000 characters." }, { status: 400 });
        }

        const blocked = /(kill|murder|steal|theft|rob|hack|hacking|malware|virus|phish|scam|fraud|bomb|weapon|gun|drug|cocaine|heroin|terror|suicide|self.?harm|porn|nude|sexual|harass|blackmail|spy|stalk|crack password|ddos|ransomware|قتل|سرق|اختراق|تهكير|سلاح|مخدرات|قنبلة|انتحار)/i;
        if (blocked.test(idea)) {
          return Response.json(
            { error: "Sorry, I can't help with that. PromptForge only creates prompts for legal and ethical ideas." },
            { status: 400 },
          );
        }

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) {
          return Response.json({ error: "AI is not configured yet. Please try again later." }, { status: 500 });
        }

        const response = await streamResponsesHTTP(
          request,
          { baseURL: "https://ai.gateway.lovable.dev/v1", apiKey, model: "openai/gpt-6-astra" },
          [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `Here is my rough idea:\n\n${idea}${langNote}${styleNote}` },
          ],
        );

        if (!response.ok) {
          let message = "The AI could not generate a prompt right now. Please try again.";
          try {
            const data = await response.clone().json();
            if (typeof data?.error?.message === "string") message = data.error.message;
            else if (typeof data?.message === "string") message = data.message;
          } catch {
            // keep default message
          }
          return Response.json({ error: message }, { status: response.status });
        }

        return response;
      },
    },
  },
});

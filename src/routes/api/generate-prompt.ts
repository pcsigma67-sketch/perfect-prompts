import { createFileRoute } from "@tanstack/react-router";
import { streamResponsesHTTP } from "../../server/ai/responses-http";

const SYSTEM_PROMPT = `You are an expert prompt engineer. The user gives you a rough, messy idea of what they want an AI to do. Your job is to turn it into one clear, complete, ready-to-use prompt they can paste into any AI assistant.

Rules:
- Output ONLY the final prompt, nothing else. No preamble, no explanation, no markdown code fences.
- Write the prompt in second person ("You are...", "Your task is...").
- Make it specific: define the AI's role, the exact task, the context, constraints, tone, and the desired output format.
- Fill in sensible details when the idea is vague, but stay faithful to the user's intent.
- Keep it focused and practical — typically 100 to 250 words.
- Write in the same language the user used.`;

export const Route = createFileRoute("/api/generate-prompt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let idea = "";
        try {
          const body = await request.json();
          idea = typeof body?.idea === "string" ? body.idea.trim() : "";
        } catch {
          idea = "";
        }
        if (!idea) {
          return Response.json({ error: "Please describe your idea first." }, { status: 400 });
        }
        if (idea.length > 4000) {
          return Response.json({ error: "Your idea is too long — keep it under 4000 characters." }, { status: 400 });
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
            { role: "user", content: `Here is my rough idea:\n\n${idea}` },
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

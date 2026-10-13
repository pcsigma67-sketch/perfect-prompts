import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  getLovableAiGatewayResponseHeaders,
} from "./run-id.ts";

export async function streamResponsesHTTP(
  request: Request,
  config: { baseURL: string; apiKey: string; model: string },
  input: string | Record<string, unknown>[],
) {
  const gateway = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  const reasoning = config.model !== "openai/chat-latest";
  try {
    const response = await gateway.fetch(`${config.baseURL.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1/responses`, {
      method: "POST",
      signal: request.signal,
      headers: { "Content-Type": "application/json", "Lovable-API-Key": config.apiKey, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: config.model,
        input,
        stream: true,
        store: false,
        ...(reasoning
          ? { reasoning: { effort: "low", summary: "auto" }, include: ["reasoning.encrypted_content"] }
          : {}),
      }),
    });
    const headers = getLovableAiGatewayResponseHeaders(response.headers);
    headers.set("Content-Type", response.headers.get("Content-Type") ?? "text/event-stream");
    return new Response(response.body, { status: response.status, headers });
  } catch (error) {
    if (request.signal.aborted && error instanceof Error && error.name === "AbortError")
      return new Response(null, { status: 499 });
    throw error;
  }
}

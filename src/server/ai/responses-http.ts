export interface ResponsesMessage {
  role: string;
  content: string;
}

export interface ResponsesOptions {
  baseURL: string;
  apiKey: string;
  model: string;
}

/**
 * Calls the OpenAI-compatible Responses API with streaming enabled and
 * returns the upstream SSE stream as a Response the route can hand to the
 * browser. Non-OK upstream responses are returned as-is so the caller can
 * read the error body.
 */
export async function streamResponsesHTTP(
  request: Request,
  options: ResponsesOptions,
  messages: ResponsesMessage[],
): Promise<Response> {
  const upstream = await fetch(`${options.baseURL}/responses`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model: options.model,
      input: messages,
      stream: true,
    }),
    signal: request.signal,
  });

  if (!upstream.ok || !upstream.body) {
    return upstream;
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
    },
  });
}

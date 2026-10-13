import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PromptForge — Turn rough ideas into perfect AI prompts" },
      {
        name: "description",
        content:
          "Describe what you want an AI to do in your own words, and PromptForge rewrites it into a clear, complete, ready-to-use prompt.",
      },
      { property: "og:title", content: "PromptForge — Turn rough ideas into perfect AI prompts" },
      {
        property: "og:description",
        content:
          "Describe what you want an AI to do in your own words, and PromptForge rewrites it into a clear, complete, ready-to-use prompt.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const EXAMPLES = [
  "I want an AI to help me write birthday messages for my friends that don't sound boring",
  "Make something that explains hard school topics to me like I'm 10 years old",
  "I need an AI to act as a job interviewer for a marketing position and ask me tough questions",
];

function Index() {
  const [idea, setIdea] = useState("");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function generate() {
    if (!idea.trim() || loading) return;
    setLoading(true);
    setError("");
    setPrompt("");
    setCopied(false);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/generate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: idea.trim() }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        let message = "Something went wrong. Please try again.";
        try {
          const data = await res.json();
          if (typeof data?.error === "string") message = data.error;
        } catch {
          // keep default
        }
        setError(message);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const event of events) {
          for (const line of event.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const json = JSON.parse(payload);
              if (json.type === "response.output_text.delta" && typeof json.delta === "string") {
                setPrompt((prev) => prev + json.delta);
              } else if (json.type === "response.failed" || json.type === "error") {
                setError(json?.response?.error?.message ?? json?.message ?? "Generation failed. Please try again.");
              }
            } catch {
              // ignore malformed chunk
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
    setLoading(false);
  }

  async function copyPrompt() {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy — select the text and copy it manually.");
    }
  }

  const ready = !!prompt && !loading;

  return (
    <div className="bg-grid min-h-screen">
      <nav className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 pt-6 sm:px-6">
        <span className="font-display text-2xl">Prompt<span className="italic text-primary">Forge</span></span>
        <a href="#about" className="text-sm text-muted-foreground transition-colors hover:text-foreground">About</a>
      </nav>
      <div className="mx-auto flex w-full max-w-3xl flex-col px-4 py-12 sm:px-6 sm:py-20">
        <header className="animate-fade-up text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-1.5 text-xs font-medium tracking-widest text-muted-foreground uppercase">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
            AI Prompt Builder
          </div>
          <h1 className="font-display text-5xl leading-[1.05] tracking-tight sm:text-7xl">
            Turn rough ideas into <span className="italic text-primary">perfect prompts</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Describe what you want an AI to do in your own words. PromptForge refines it into a clear,
            structured prompt you can use anywhere.
          </p>
        </header>

        <section className="glass animate-fade-up mt-12 rounded-2xl border border-border p-5 sm:p-6" style={{ animationDelay: "0.1s" }}>
          <label htmlFor="idea" className="mb-3 block text-sm font-semibold text-foreground">Your idea</label>
          <textarea
            id="idea"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="e.g. I want an AI that helps me plan my weekly meals but I hate cooking complicated stuff..."
            rows={5}
            maxLength={4000}
            className="w-full resize-none rounded-xl border border-input bg-background/60 p-4 text-base leading-relaxed text-foreground placeholder:text-muted-foreground/70 transition focus:border-primary/60 focus:ring-4 focus:ring-ring/15 focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate();
            }}
          />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">Ctrl + Enter to generate</span>
            {loading ? (
              <button onClick={stop} className="rounded-full border border-border bg-secondary px-6 py-2.5 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-accent">
                Stop
              </button>
            ) : (
              <button
                onClick={generate}
                disabled={!idea.trim()}
                className="glow-primary rounded-full bg-primary px-7 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:-translate-y-0.5 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:translate-y-0"
              >
                Forge my prompt →
              </button>
            )}
          </div>
        </section>

        <div className="animate-fade-up mt-6" style={{ animationDelay: "0.2s" }}>
          <p className="mb-3 text-xs font-medium tracking-widest text-muted-foreground uppercase">Try an example</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                onClick={() => setIdea(example)}
                className="rounded-xl border border-border bg-card/40 px-4 py-3 text-left text-sm leading-snug text-muted-foreground transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground"
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mt-8 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">{error}</div>
        )}

        {(prompt || loading) && (
          <section className="glass animate-fade-up mt-10 rounded-2xl border border-border p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <span className={`inline-block h-2 w-2 rounded-full ${loading ? "animate-pulse bg-muted-foreground" : "bg-primary"}`} />
                {loading ? "Writing your prompt…" : "Your prompt is ready"}
              </h2>
            </div>
            <div className="rounded-xl border border-border bg-background/60 p-5">
              <p className="font-mono-output text-sm leading-relaxed whitespace-pre-wrap text-card-foreground">
                {prompt}
                {loading && <span className="animate-blink text-primary">▍</span>}
              </p>
            </div>
            {ready && (
              <div className="animate-fade-up mt-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">Paste it into ChatGPT, Claude, Gemini or any AI.</p>
                <button
                  onClick={copyPrompt}
                  className="glow-primary inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:-translate-y-0.5"
                >
                  {copied ? "✓ Copied to clipboard" : "Copy the prompt"}
                </button>
              </div>
            )}
          </section>
        )}

        <footer id="about" className="mt-auto pt-24">
          <div className="glass animate-fade-up rounded-2xl border border-border p-8 text-center">
            <p className="text-xs font-medium tracking-widest text-primary uppercase">About</p>
            <h2 className="font-display mt-2 text-3xl">Made by Ahmad Zaxo</h2>
            <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
              I'm a high school student with a passion for AI. Honestly, I was bored — so I built this.
              PromptForge turns rough, everyday ideas into prompts that actually work.
            </p>
            <a
              href="https://instagram.com/4hmadzaxo7"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-5 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:border-primary/50 hover:bg-accent"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
              </svg>
              @4hmadzaxo7
            </a>
          </div>
          <p className="mt-8 pb-2 text-center text-xs text-muted-foreground">© PromptForge · Rough idea in, perfect prompt out.</p>
        </footer>
      </div>
    </div>
  );
}

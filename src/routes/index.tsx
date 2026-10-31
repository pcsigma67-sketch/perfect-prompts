import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CooldownButton } from "@/components/cooldown-button";
import { T, type Lang, RTL_LANGS, LANG_OPTIONS } from "@/lib/i18n";
import { playAmbient, setVolume, type AmbientKind } from "@/lib/ambient";

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

type PromptStyle = "professional" | "creative" | "simple" | "detailed";
type Settings = { lang: Lang; sound: AmbientKind; volume: number; motion: boolean; style: PromptStyle };
const DEFAULTS: Settings = { lang: "en", sound: "off", volume: 0.5, motion: true, style: "professional" };

function loadSettings(): Settings | null {
  try {
    const raw = localStorage.getItem("pf-settings");
    if (!raw) return null;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return null;
  }
}

function Index() {
  const [idea, setIdea] = useState("");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Load saved settings after hydration; show the welcome chooser on first visit.
  useEffect(() => {
    const saved = loadSettings();
    if (saved) setSettings(saved);
    else setWelcomeOpen(true);
    setHydrated(true);
  }, []);

  const { lang, sound, volume, motion, style } = settings;
  const t = T[lang];

  function update(patch: Partial<Settings>) {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem("pf-settings", JSON.stringify(next));
      } catch {
        // storage unavailable
      }
      return next;
    });
  }

  useEffect(() => {
    if (!hydrated) return;
    playAmbient(sound, volume);
    return () => playAmbient("off", 0);
  }, [sound, hydrated]);

  useEffect(() => {
    if (hydrated) setVolume(volume);
  }, [volume, hydrated]);

  useEffect(() => {
    const onVisibility = () => {
      document.documentElement.classList.toggle("page-hidden", document.hidden);
      if (document.hidden) playAmbient("off", 0);
      else if (sound !== "off") playAmbient(sound, volume);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [sound, volume]);

  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.dir = RTL_LANGS.includes(lang) ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }, [lang, hydrated]);

  function chooseSound(kind: AmbientKind) {
    update({ sound: kind });
  }

  async function generate() {
    if (!idea.trim() || loading) return;
    setLoading(true);
    setError("");
    setPrompt("");
    setCopied(false);

    const controller = new AbortController();
    abortRef.current = controller;

    let accumulated = "";
    let renderTimer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      renderTimer = null;
      setPrompt(accumulated);
    };

    try {
      const res = await fetch("/api/generate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: idea.trim(), lang, style }),
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
                accumulated += json.delta;
                if (accumulated.trim().startsWith("REFUSED")) {
                  accumulated = "";
                  setError("Sorry, I can't help with that. PromptForge only creates prompts for legal and ethical ideas.");
                  controller.abort();
                }
                if (renderTimer === null) renderTimer = setTimeout(flush, 80);
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
      if (renderTimer !== null) clearTimeout(renderTimer);
      flush();
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
    <div className={`relative min-h-screen overflow-hidden ${RTL_LANGS.includes(lang) ? "font-arabic" : ""}`}>
      <div aria-hidden className={`bg-scene ${motion ? "" : "paused"}`}>
        <div className="bg-lines" />
      </div>

      <nav className="relative z-10 mx-auto flex w-full max-w-4xl items-center justify-between px-4 pt-6 sm:px-6">
        <span className="font-display text-2xl" dir="ltr">Prompt<span className="italic text-primary">Forge</span></span>
        <div className="flex items-center gap-5">
          <a href="#about" className="link-underline text-sm text-muted-foreground hover:text-foreground">{t.about}</a>
          <a
            href="https://instagram.com/4hmadzaxo7"
            target="_blank"
            rel="noopener noreferrer"
            dir="ltr"
            className="tap-host inline-flex items-center gap-1.5 rounded-full border border-border bg-card/50 px-3.5 py-1.5 text-sm text-muted-foreground transition-all hover:border-primary/50 hover:text-foreground"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
              <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
              <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
              <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
            </svg>
            <span className="hidden sm:inline">@4hmadzaxo7</span>
          </a>
          <CooldownButton
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-3.5 py-1.5 text-sm text-muted-foreground transition-all hover:text-foreground"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 transition-transform duration-500 hover:rotate-90" aria-hidden><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
            {t.settings}
            {sound !== "off" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />}
          </CooldownButton>
        </div>
      </nav>

      {welcomeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 animate-in fade-in">
          <div className="panel w-full max-w-md rounded-2xl border border-border p-8 text-center shadow-2xl animate-in zoom-in-95">
            <span className="font-display text-3xl" dir="ltr">Prompt<span className="italic text-primary">Forge</span></span>
            <h2 className="font-display mt-4 text-2xl">{t.welcomeTitle}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t.welcomeSub}</p>

            <p className="mt-6 mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{t.language}</p>
            <div className="grid grid-cols-2 gap-2">
              {LANG_OPTIONS.map(([v, label]) => (
                <CooldownButton
                  key={v}
                  onClick={() => update({ lang: v })}
                  className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all ${lang === v ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background/50 text-muted-foreground hover:text-foreground"}`}
                >
                  {label}
                </CooldownButton>
              ))}
            </div>

            <p className="mt-5 mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{t.sound}</p>
            <div className="flex gap-2">
              {([["rain", t.rain, "🌧"], ["fire", t.fire, "🔥"], ["off", t.off, "🔇"]] as [AmbientKind, string, string][]).map(([v, label, icon]) => (
                <CooldownButton
                  key={v}
                  onClick={() => chooseSound(v)}
                  className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${sound === v ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background/50 text-muted-foreground hover:text-foreground"}`}
                >
                  <span className="mr-1" aria-hidden>{icon}</span>{label}
                </CooldownButton>
              ))}
            </div>

            <CooldownButton
              onClick={() => setWelcomeOpen(false)}
              className="mt-7 w-full rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-all hover:-translate-y-0.5"
            >
              {t.welcomeStart}
            </CooldownButton>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-background/60 p-4 pt-20 animate-in fade-in" onClick={() => setSettingsOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95 slide-in-from-top-2" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-2xl">{t.settings}</h2>
              <CooldownButton onClick={() => setSettingsOpen(false)} className="text-sm text-muted-foreground hover:text-foreground">{t.close}</CooldownButton>
            </div>
            <SettingRow label={t.language}>
              <Segmented value={lang} onChange={(v) => update({ lang: v as Lang })} options={LANG_OPTIONS} />
            </SettingRow>
            <SettingRow label={t.sound}>
              <Segmented value={sound} onChange={(v) => chooseSound(v as AmbientKind)} options={[["off", t.off], ["rain", t.rain], ["fire", t.fire]]} />
            </SettingRow>
            <SettingRow label={`${t.volume} · ${Math.round(volume * 100)}%`}>
              <input type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => { update({ volume: Number(e.target.value) }); setVolume(Number(e.target.value)); }} className="w-full accent-primary" />
            </SettingRow>
            <SettingRow label={t.motion}>
              <Segmented value={motion ? "on" : "off"} onChange={(v) => update({ motion: v === "on" })} options={[["on", t.on], ["off", t.off]]} />
            </SettingRow>
          </div>
        </div>
      )}

      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col px-4 py-12 sm:px-6 sm:py-20">
        <header className="text-center">
          <div className="animate-fade-up mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-4 py-1.5 text-xs font-medium tracking-widest text-muted-foreground uppercase">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
            {t.badge}
          </div>
          <h1 className="animate-fade-up font-display text-5xl leading-[1.08] tracking-normal sm:text-7xl" style={{ animationDelay: "0.08s" }}>
            {t.h1a} <span className="italic text-primary">{t.h1b}</span>
          </h1>
          <p className="animate-fade-up mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg" style={{ animationDelay: "0.16s" }}>{t.sub}</p>
        </header>

        <section className="panel animate-fade-up mt-12 rounded-2xl border border-border p-5 sm:p-6" style={{ animationDelay: "0.24s" }}>
          <label htmlFor="idea" className="mb-3 block text-sm font-semibold text-foreground">{t.yourIdea}</label>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t.style}:</span>
            {([
              ["professional", t.styleProfessional],
              ["creative", t.styleCreative],
              ["simple", t.styleSimple],
              ["detailed", t.styleDetailed],
            ] as [PromptStyle, string][]).map(([v, label]) => (
              <CooldownButton
                key={v}
                onClick={() => update({ style: v })}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all ${style === v ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background/50 text-muted-foreground hover:text-foreground"}`}
              >
                {label}
              </CooldownButton>
            ))}
          </div>
          <textarea
            id="idea"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder={t.placeholder}
            rows={5}
            maxLength={4000}
            className="w-full resize-none rounded-xl border border-input bg-background/50 p-4 text-base leading-relaxed text-foreground placeholder:text-muted-foreground/60 transition focus:border-primary/60 focus:ring-4 focus:ring-ring/10 focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate();
            }}
          />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">{t.shortcut}</span>
            {loading ? (
              <CooldownButton key="stop" onClick={stop} className="rounded-full border border-border bg-secondary px-6 py-2.5 text-sm font-semibold text-secondary-foreground transition-all hover:bg-accent">{t.stop}</CooldownButton>
            ) : (
              <CooldownButton
                key="generate"
                onClick={generate}
                disabled={!idea.trim()}
                className="group inline-flex items-center gap-2 rounded-full bg-primary px-7 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
              >
                {t.forge}
                <span className="transition-transform group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1">→</span>
              </CooldownButton>
            )}
          </div>
        </section>

        <div className="animate-fade-up mt-6" style={{ animationDelay: "0.32s" }}>
          <p className="mb-3 text-xs font-medium tracking-widest text-muted-foreground uppercase">{t.tryEx}</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {t.examples.map((example) => (
              <CooldownButton
                key={example}
                onClick={() => setIdea(example)}
                className="rounded-xl border border-border bg-card/40 px-4 py-3 text-start text-sm leading-snug text-muted-foreground transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:text-foreground"
              >
                {example}
              </CooldownButton>
            ))}
          </div>
        </div>

        {error && (
          <div className="mt-8 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">{error}</div>
        )}

        {(prompt || loading) && (
          <section className="panel animate-fade-up mt-10 rounded-2xl border border-border p-5 sm:p-6">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className={`inline-block h-2 w-2 rounded-full ${loading ? "animate-pulse bg-muted-foreground" : "bg-primary"}`} />
              {loading ? t.writing : t.ready}
            </h2>
            <div className="rounded-xl border border-border bg-background/50 p-5" dir="auto">
              <p className="font-mono-output text-sm leading-relaxed whitespace-pre-wrap text-card-foreground">
                {prompt}
                {loading && <span className="animate-blink text-primary">▍</span>}
              </p>
            </div>
            {ready && (
              <div className="animate-fade-up mt-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">{t.pasteHint}</p>
                <CooldownButton
                  onClick={copyPrompt}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:-translate-y-0.5"
                >
                  {copied ? `✓ ${t.copied}` : t.copy}
                </CooldownButton>
              </div>
            )}
          </section>
        )}

        <footer id="about" className="mt-auto pt-24">
          <div className="panel rounded-2xl border border-border p-8 text-center">
            <p className="text-xs font-medium tracking-widest text-primary uppercase">{t.about}</p>
            <h2 className="font-display mt-2 text-3xl">{t.aboutTitle}</h2>
            <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">{t.aboutBody}</p>
            <a
              href="https://instagram.com/4hmadzaxo7"
              target="_blank"
              rel="noopener noreferrer"
              dir="ltr"
              className="tap-host mt-6 inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-5 py-2 text-sm font-medium text-secondary-foreground transition-all hover:border-primary/50 hover:bg-accent"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
              </svg>
              @4hmadzaxo7
            </a>
          </div>

          <div className="panel animate-fade-up mt-6 rounded-2xl border border-border p-7 text-center">
            <p className="text-xs font-medium tracking-widest text-primary uppercase">{t.forAds}</p>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">{t.forAdsBody}</p>
            <a
              href="https://instagram.com/4hmadzaxo7"
              target="_blank"
              rel="noopener noreferrer"
              dir="ltr"
              className="tap-host mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-all hover:-translate-y-0.5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
              </svg>
              {t.contactInsta}
            </a>
          </div>

          <p className="font-display mt-14 flex items-center justify-center gap-2 text-lg tracking-wide text-muted-foreground">
            {t.moreSoon}
            <span className="pf-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>
          </p>
          <p className="mt-4 pb-2 text-center text-xs text-muted-foreground">© PromptForge · {t.footer}</p>
        </footer>
      </div>
    </div>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border py-4 first:border-t-0 first:pt-0">
      <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      {children}
    </div>
  );
}

function Segmented({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-2xl border border-border bg-background/50 p-1">
      {options.map(([v, label]) => (
        <CooldownButton
          key={v}
          onClick={() => onChange(v)}
          className={`flex-1 rounded-full px-3 py-1.5 text-sm transition-colors ${value === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          {label}
        </CooldownButton>
      ))}
    </div>
  );
}

// Ambient sounds synthesized live with the Web Audio API — no music, no files.
export type AmbientKind = "off" | "rain" | "fire";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let nodes: AudioNode[] = [];
let crackleTimer: number | null = null;
let cachedNoise: Partial<Record<"rain" | "fire", AudioBuffer>> = {};
const activeCrackles = new Set<() => void>();

function noiseBuffer(c: AudioContext, brown: boolean) {
  const len = c.sampleRate * 4;
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
  }
  return buf;
}

function stopAll() {
  if (crackleTimer) window.clearTimeout(crackleTimer);
  crackleTimer = null;
  activeCrackles.forEach((cleanup) => cleanup());
  activeCrackles.clear();
  nodes.forEach((n) => {
    try {
      (n as AudioBufferSourceNode).stop?.();
    } catch {}
    n.disconnect();
  });
  nodes = [];
}

export function setVolume(v: number) {
  if (master && ctx) master.gain.setTargetAtTime(v, ctx.currentTime, 0.2);
}

export function playAmbient(kind: AmbientKind, volume: number) {
  if (typeof window === "undefined") return;
  stopAll();
  if (kind === "off") {
    if (ctx) void ctx.suspend();
    return;
  }
  ctx ??= new AudioContext();
  void ctx.resume();
  const c = ctx;
  if (!master) {
    master = c.createGain();
    master.connect(c.destination);
  }
  master.gain.value = volume;

  const src = c.createBufferSource();
  cachedNoise[kind] ??= noiseBuffer(c, kind === "fire");
  src.buffer = cachedNoise[kind] ?? null;
  src.loop = true;

  if (kind === "rain") {
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 400;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 6000;
    const g = c.createGain();
    g.gain.value = 0.35;
    src.connect(hp).connect(lp).connect(g).connect(master);
    nodes.push(src, hp, lp, g);
  } else {
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 500;
    const g = c.createGain();
    g.gain.value = 0.9;
    src.connect(lp).connect(g).connect(master);
    nodes.push(src, lp, g);
    const crackle = () => {
      const output = master;
      if (!output) return;
      const len = Math.floor(c.sampleRate * (0.005 + Math.random() * 0.02));
      const b = c.createBuffer(1, len, c.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      const s = c.createBufferSource();
      s.buffer = b;
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1500 + Math.random() * 3000;
      const cg = c.createGain();
      cg.gain.value = 0.2 + Math.random() * 0.5;
      s.connect(bp).connect(cg).connect(output);
      const cleanup = () => {
        s.onended = null;
        try { s.stop(); } catch { /* already stopped */ }
        s.disconnect();
        bp.disconnect();
        cg.disconnect();
        activeCrackles.delete(cleanup);
      };
      activeCrackles.add(cleanup);
      s.onended = cleanup;
      s.start();
      crackleTimer = window.setTimeout(crackle, 60 + Math.random() * 400);
    };
    crackle();
  }
  src.start();
}

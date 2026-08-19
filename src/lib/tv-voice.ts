export type TvVoiceSettings = {
  voiceURI: string;
  voiceName: string;
  voiceLang: string;
  rate: number;
};

export const DEFAULT_TV_VOICE: TvVoiceSettings = {
  voiceURI: "",
  voiceName: "",
  voiceLang: "es-ES",
  rate: 0.9,
};

export const VOICE_RATE_MIN = 0.6;
export const VOICE_RATE_MAX = 1.5;
export const VOICE_RATE_STEP = 0.05;

export function parseTvVoiceSettings(sound: Record<string, unknown> | undefined): TvVoiceSettings {
  const rateRaw = Number(sound?.rate);
  const rate = Number.isFinite(rateRaw)
    ? Math.min(VOICE_RATE_MAX, Math.max(VOICE_RATE_MIN, rateRaw))
    : DEFAULT_TV_VOICE.rate;
  return {
    voiceURI: typeof sound?.voiceURI === "string" ? sound.voiceURI : "",
    voiceName: typeof sound?.voiceName === "string" ? sound.voiceName : "",
    voiceLang: typeof sound?.voiceLang === "string" && sound.voiceLang ? sound.voiceLang : DEFAULT_TV_VOICE.voiceLang,
    rate,
  };
}

export function listSpeechVoices(): SpeechSynthesisVoice[] {
  try {
    if (typeof window === "undefined" || !window.speechSynthesis) return [];
    return window.speechSynthesis.getVoices();
  } catch {
    return [];
  }
}

export function waitForSpeechVoices(maxMs = 600): Promise<SpeechSynthesisVoice[]> {
  const existing = listSpeechVoices();
  if (existing.length) return Promise.resolve(existing);
  if (typeof window === "undefined" || !window.speechSynthesis) return Promise.resolve([]);
  return new Promise((resolve) => {
    const finish = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", finish);
      window.clearTimeout(t);
      resolve(listSpeechVoices());
    };
    window.speechSynthesis.addEventListener("voiceschanged", finish);
    const t = window.setTimeout(finish, maxMs);
  });
}

export function subscribeSpeechVoices(onChange: (voices: SpeechSynthesisVoice[]) => void): () => void {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    onChange([]);
    return () => {};
  }
  const emit = () => onChange(listSpeechVoices());
  emit();
  window.speechSynthesis.addEventListener("voiceschanged", emit);
  const t = window.setTimeout(emit, 300);
  return () => {
    window.speechSynthesis.removeEventListener("voiceschanged", emit);
    window.clearTimeout(t);
  };
}

export function findSpeechVoice(settings: TvVoiceSettings): SpeechSynthesisVoice | null {
  const voices = listSpeechVoices();
  if (!voices.length) return null;
  if (settings.voiceURI) {
    const byUri = voices.find((v) => v.voiceURI === settings.voiceURI);
    if (byUri) return byUri;
  }
  if (settings.voiceName) {
    const wanted = settings.voiceName.toLowerCase();
    const byName = voices.find((v) => v.name.toLowerCase() === wanted);
    if (byName) return byName;
  }
  const lang = (settings.voiceLang || DEFAULT_TV_VOICE.voiceLang).toLowerCase();
  const exact = voices.find((v) => v.lang.toLowerCase() === lang);
  if (exact) return exact;
  const prefix = lang.split("-")[0];
  return voices.find((v) => v.lang.toLowerCase().startsWith(prefix)) ?? null;
}

/** Aplica voz y velocidad. Si hay voz concreta, lang = voice.lang (evita audio duplicado en Chrome). */
export function applyVoiceToUtterance(msg: SpeechSynthesisUtterance, settings: TvVoiceSettings) {
  const wantsSpecific = Boolean(settings.voiceURI || settings.voiceName);
  const voice = findSpeechVoice(settings);
  if (wantsSpecific && voice) {
    msg.voice = voice;
    msg.lang = voice.lang;
  } else {
    msg.lang = settings.voiceLang || DEFAULT_TV_VOICE.voiceLang;
  }
  msg.rate = settings.rate;
  msg.volume = 1;
  msg.pitch = 1;
}

export function groupSpeechVoices(voices: SpeechSynthesisVoice[]) {
  const byName = (a: SpeechSynthesisVoice, b: SpeechSynthesisVoice) =>
    a.name.localeCompare(b.name, "es", { sensitivity: "base" });
  const spanish = voices.filter((v) => v.lang.toLowerCase().startsWith("es")).sort(byName);
  const other = voices.filter((v) => !v.lang.toLowerCase().startsWith("es")).sort(byName);
  return { spanish, other };
}

export function rateLabel(rate: number): string {
  if (rate <= 0.7) return "Muy lenta";
  if (rate < 0.9) return "Lenta";
  if (rate <= 1.05) return "Normal";
  if (rate <= 1.25) return "Rápida";
  return "Muy rápida";
}

export function voiceOptionLabel(voice: SpeechSynthesisVoice): string {
  return `${voice.name} (${voice.lang})`;
}

export const VOICE_PREVIEW_TEXT = "ve seis pasar a ventanilla uno";

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

/** Aplica voz y velocidad. En Chrome/Edge no mezclar voice + lang distinto: silencia o duplica. */
export function applyVoiceToUtterance(msg: SpeechSynthesisUtterance, settings: TvVoiceSettings, allowVoice = true) {
  const wantsSpecific = allowVoice && Boolean(settings.voiceURI || settings.voiceName);
  const voice = wantsSpecific ? findSpeechVoice(settings) : null;
  if (voice) {
    msg.voice = voice;
    msg.lang = voice.lang;
  } else {
    msg.lang = settings.voiceLang || DEFAULT_TV_VOICE.voiceLang;
  }
  msg.rate = settings.rate;
  msg.volume = 1;
  msg.pitch = 1;
}

function resumeSpeechSynthesis(synth: SpeechSynthesis) {
  try {
    if (synth.paused) synth.resume();
  } catch {
    /* ignore */
  }
}

/** Chrome/Edge: cancelar y hablar en el mismo tick suele tragarse el audio. */
export function speakTvUtterance(text: string, settings: TvVoiceSettings): Promise<void> {
  return new Promise((resolve) => {
    try {
      if (typeof window === "undefined" || !window.speechSynthesis) {
        resolve();
        return;
      }
      const synth = window.speechSynthesis;
      resumeSpeechSynthesis(synth);

      let settled = false;
      let started = false;
      let triedFallback = false;
      const timers: number[] = [];

      const done = () => {
        if (settled) return;
        settled = true;
        for (const id of timers) window.clearTimeout(id);
        resolve();
      };

      const run = (allowVoice: boolean) => {
        if (settled) return;
        resumeSpeechSynthesis(synth);
        const msg = new SpeechSynthesisUtterance(text);
        applyVoiceToUtterance(msg, settings, allowVoice);
        msg.onstart = () => {
          started = true;
        };
        msg.onend = done;
        msg.onerror = () => {
          if (!started && allowVoice && !triedFallback) {
            triedFallback = true;
            run(false);
            return;
          }
          done();
        };
        synth.speak(msg);
      };

      try {
        synth.cancel();
      } catch {
        /* ignore */
      }

      timers.push(
        window.setTimeout(() => {
          run(true);
          timers.push(
            window.setTimeout(() => {
              if (settled || started) return;
              triedFallback = true;
              try {
                synth.cancel();
              } catch {
                /* ignore */
              }
              timers.push(window.setTimeout(() => run(false), 50));
            }, 800),
          );
        }, 60),
      );

      timers.push(window.setTimeout(done, 12_000));
    } catch {
      resolve();
    }
  });
}

export function groupSpeechVoices(voices: SpeechSynthesisVoice[]) {
  const byName = (a: SpeechSynthesisVoice, b: SpeechSynthesisVoice) =>
    a.name.localeCompare(b.name, "es", { sensitivity: "base" });
  const spanish = voices.filter(isSpanishVoice);
  const latinAmerica = spanish.filter(isLatinAmericanSpanish).sort(byName);
  const spain = spanish.filter((v) => !isLatinAmericanSpanish(v)).sort(byName);
  return { spain, latinAmerica };
}

function normalizeVoiceLang(lang: string): string {
  return lang.trim().toLowerCase().replace(/_/g, "-");
}

function isSpanishVoice(voice: SpeechSynthesisVoice): boolean {
  const lang = normalizeVoiceLang(voice.lang);
  return lang === "es" || lang.startsWith("es-");
}

function isLatinAmericanSpanish(voice: SpeechSynthesisVoice): boolean {
  if (!isSpanishVoice(voice)) return false;
  const lang = normalizeVoiceLang(voice.lang);
  if (lang === "es-es") return false;
  if (lang.startsWith("es-") && lang !== "es-es") return true;
  return LATIN_AMERICA_NAME.test(voice.name);
}

const LATIN_AMERICA_NAME =
  /mexico|méxico|mexican|latina|latino|am[eé]rica|argentina|colombia|chile|peru|perú|venezuela|bolivia|ecuador|uruguay|paraguay|costa rica|panam[aá]|guatemala|honduras|nicaragua|salvador|dominicana|cuba|puerto rico|estados unidos|united states|sabina|raul|raúl|dalia/i;

export function voiceOptionLabel(voice: SpeechSynthesisVoice): string {
  return `${voice.name} (${spanishVoiceRegion(voice)})`;
}

function spanishVoiceRegion(voice: SpeechSynthesisVoice): string {
  const lang = normalizeVoiceLang(voice.lang);
  const regions: Record<string, string> = {
    "es-es": "España",
    "es-mx": "México",
    "es-us": "Latinoamérica",
    "es-419": "Latinoamérica",
    "es-ar": "Argentina",
    "es-bo": "Bolivia",
    "es-cl": "Chile",
    "es-co": "Colombia",
    "es-cr": "Costa Rica",
    "es-cu": "Cuba",
    "es-do": "República Dominicana",
    "es-ec": "Ecuador",
    "es-gt": "Guatemala",
    "es-hn": "Honduras",
    "es-ni": "Nicaragua",
    "es-pa": "Panamá",
    "es-pe": "Perú",
    "es-pr": "Puerto Rico",
    "es-py": "Paraguay",
    "es-sv": "El Salvador",
    "es-uy": "Uruguay",
    "es-ve": "Venezuela",
  };
  if (regions[lang]) return regions[lang];
  return isLatinAmericanSpanish(voice) ? "Latinoamérica" : "España";
}

export function rateLabel(rate: number): string {
  if (rate <= 0.7) return "Muy lenta";
  if (rate < 0.9) return "Lenta";
  if (rate <= 1.05) return "Normal";
  if (rate <= 1.25) return "Rápida";
  return "Muy rápida";
}

export const VOICE_PREVIEW_TEXT = "ve seis pasar a ventanilla uno";

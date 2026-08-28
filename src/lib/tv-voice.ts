export type TvVoiceSettings = {
  voiceURI: string;
  voiceName: string;
  voiceLang: string;
  rate: number;
};

export const DEFAULT_TV_VOICE: TvVoiceSettings = {
  voiceURI: "",
  voiceName: "Dalia",
  voiceLang: "es-MX",
  rate: 0.9,
};

export const VOICE_RATE_MIN = 0.6;
export const VOICE_RATE_MAX = 1.5;
export const VOICE_RATE_STEP = 0.05;

export type SpanishVoiceLocale = {
  lang: string;
  label: string;
  group: "europa" | "latinoamerica";
};

/** Lista fija: igual en celular y computadora. */
export const SPANISH_VOICE_CATALOG: SpanishVoiceLocale[] = [
  { lang: "es-ES", label: "España", group: "europa" },
  { lang: "es-MX", label: "México", group: "latinoamerica" },
  { lang: "es-AR", label: "Argentina", group: "latinoamerica" },
  { lang: "es-BO", label: "Bolivia", group: "latinoamerica" },
  { lang: "es-CL", label: "Chile", group: "latinoamerica" },
  { lang: "es-CO", label: "Colombia", group: "latinoamerica" },
  { lang: "es-CR", label: "Costa Rica", group: "latinoamerica" },
  { lang: "es-CU", label: "Cuba", group: "latinoamerica" },
  { lang: "es-DO", label: "República Dominicana", group: "latinoamerica" },
  { lang: "es-EC", label: "Ecuador", group: "latinoamerica" },
  { lang: "es-GT", label: "Guatemala", group: "latinoamerica" },
  { lang: "es-HN", label: "Honduras", group: "latinoamerica" },
  { lang: "es-NI", label: "Nicaragua", group: "latinoamerica" },
  { lang: "es-PA", label: "Panamá", group: "latinoamerica" },
  { lang: "es-PE", label: "Perú", group: "latinoamerica" },
  { lang: "es-PR", label: "Puerto Rico", group: "latinoamerica" },
  { lang: "es-PY", label: "Paraguay", group: "latinoamerica" },
  { lang: "es-SV", label: "El Salvador", group: "latinoamerica" },
  { lang: "es-US", label: "Estados Unidos", group: "latinoamerica" },
  { lang: "es-UY", label: "Uruguay", group: "latinoamerica" },
  { lang: "es-VE", label: "Venezuela", group: "latinoamerica" },
];

export function parseTvVoiceSettings(sound: Record<string, unknown> | undefined): TvVoiceSettings {
  const rateRaw = Number(sound?.rate);
  const rate = Number.isFinite(rateRaw)
    ? Math.min(VOICE_RATE_MAX, Math.max(VOICE_RATE_MIN, rateRaw))
    : DEFAULT_TV_VOICE.rate;
  const rawLang = typeof sound?.voiceLang === "string" ? sound.voiceLang : "";
  const voiceLang = catalogLang(rawLang) || DEFAULT_TV_VOICE.voiceLang;
  const rawName = typeof sound?.voiceName === "string" ? sound.voiceName.trim() : "";
  const voiceName = rawName || DEFAULT_TV_VOICE.voiceName;
  return {
    voiceURI: "",
    voiceName,
    voiceLang,
    rate,
  };
}

function catalogLang(lang: string): string {
  const n = normalizeVoiceLang(lang);
  if (!n) return "";
  const exact = SPANISH_VOICE_CATALOG.find((c) => normalizeVoiceLang(c.lang) === n);
  if (exact) return exact.lang;
  if (n === "es" || n.startsWith("es-es")) return "es-ES";
  if (n.startsWith("es-")) return "es-MX";
  return "";
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

function localeFallbackChain(lang: string): string[] {
  const wanted = normalizeVoiceLang(lang) || "es-es";
  const latam = [
    "es-mx", "es-us", "es-419", "es-ar", "es-co", "es-cl", "es-pe", "es-bo",
    "es-ve", "es-ec", "es-uy", "es-py", "es-cr", "es-pa", "es-gt", "es-hn",
    "es-ni", "es-sv", "es-do", "es-cu", "es-pr",
  ];
  const chain = wanted === "es-es"
    ? ["es-es", "es"]
    : [wanted, ...latam.filter((x) => x !== wanted), "es", "es-es"];
  return [...new Set(chain)];
}

export function findSpeechVoice(settings: TvVoiceSettings): SpeechSynthesisVoice | null {
  const voices = listSpeechVoices().filter(isSpanishVoice);
  if (!voices.length) return listSpeechVoices()[0] ?? null;

  const wantedName = settings.voiceName?.trim();
  if (wantedName) {
    const byName = voices.find((v) => v.name.toLowerCase().includes(wantedName.toLowerCase()));
    if (byName) return byName;
  }

  for (const lang of localeFallbackChain(settings.voiceLang || DEFAULT_TV_VOICE.voiceLang)) {
    const match = voices.find((v) => normalizeVoiceLang(v.lang) === lang);
    if (match) return match;
    const prefix = voices.find((v) => normalizeVoiceLang(v.lang).startsWith(lang));
    if (prefix) return prefix;
  }
  return voices[0] ?? null;
}

/** Aplica voz y velocidad. Si hay voz del país, se usa; si no, el español más cercano. */
export function applyVoiceToUtterance(msg: SpeechSynthesisUtterance, settings: TvVoiceSettings, allowVoice = true) {
  const lang = settings.voiceLang || DEFAULT_TV_VOICE.voiceLang;
  const voice = allowVoice ? findSpeechVoice(settings) : null;
  if (voice) {
    msg.voice = voice;
    msg.lang = voice.lang;
  } else {
    msg.lang = lang;
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

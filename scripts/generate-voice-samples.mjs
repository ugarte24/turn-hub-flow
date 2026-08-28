/** Genera muestras de voz para elegir acento en la TV. Uso: node scripts/generate-voice-samples.mjs */
import { mkdirSync, writeFileSync, createWriteStream } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "voice-samples");
const text = "ve seis pasar a ventanilla uno";

const VOICES = [
  {
    id: "elvira-espana",
    label: "Elvira (España — femenina)",
    voice: "es-ES-ElviraNeural",
  },
  {
    id: "sabina-mexico",
    label: "Sabina (México — femenina)",
    voice: "es-MX-SabinaNeural",
  },
  {
    id: "dalia-mexico",
    label: "Dalia (México — femenina neural)",
    voice: "es-MX-DaliaNeural",
  },
  {
    id: "jorge-mexico",
    label: "Jorge (México — masculina)",
    voice: "es-MX-JorgeNeural",
  },
];

function streamToFile(stream, filePath) {
  return new Promise((resolve, reject) => {
    const ws = createWriteStream(filePath);
    stream.pipe(ws);
    ws.on("finish", resolve);
    ws.on("error", reject);
    stream.on("error", reject);
  });
}

async function generateOne(entry) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(entry.voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(text, { rate: "-8%" });
  const filePath = join(outDir, `${entry.id}.mp3`);
  await streamToFile(audioStream, filePath);
  console.log(`OK ${entry.id}`);
  return { ...entry, file: `/voice-samples/${entry.id}.mp3` };
}

mkdirSync(outDir, { recursive: true });

const results = [];
for (const v of VOICES) {
  try {
    results.push(await generateOne(v));
  } catch (e) {
    console.warn(`SKIP ${v.id}: ${e instanceof Error ? e.message : e}`);
  }
}

const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SIGAT — Muestras de voz</title>
  <link rel="icon" href="/favicon.png" type="image/png" />
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 1.25rem; background: #f7faf8; color: #1a2e28; }
    h1 { font-size: 1.35rem; margin: 0 0 .25rem; }
    p { color: #5a7368; font-size: .95rem; line-height: 1.5; }
    .card { background: #fff; border: 1px solid #d5e3dc; border-radius: 1rem; padding: 1rem 1.1rem; margin: .85rem 0; }
    .card h2 { margin: 0 0 .35rem; font-size: 1.05rem; }
    .card small { color: #5a7368; display: block; margin-bottom: .65rem; }
    audio { width: 100%; margin-top: .35rem; }
    .phrase { font-size: .85rem; background: #eef4f1; padding: .5rem .65rem; border-radius: .5rem; margin-top: 1rem; }
  </style>
</head>
<body>
  <h1>Muestras de voz — SIGAT</h1>
  <p>Escuchá las voces con la misma frase que usa la pantalla TV al llamar un turno.</p>
  <p class="phrase"><strong>Frase:</strong> «${text}»</p>
${results
  .map(
    (r) => `  <div class="card">
    <h2>${r.label}</h2>
    <small>${r.voice}</small>
    <audio controls preload="metadata" src="${r.file}"></audio>
  </div>`,
  )
  .join("\n")}
  <p style="font-size:.8rem;color:#5a7368;margin-top:1.5rem">Elegí la que prefieras y configurala en Admin → Configuración → Sonido y voz.</p>
</body>
</html>
`;

writeFileSync(join(outDir, "index.html"), html, "utf8");
console.log(`Listo: public/voice-samples/index.html (${results.length} audios)`);

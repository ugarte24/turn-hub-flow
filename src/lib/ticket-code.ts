/** Formats ticket codes without hyphen or leading zeros: V-002 → V2.
 *  Área Inmueble (I) se muestra como ɪ para que no se confunda con un 1. */
export function formatTicketCode(code: string | null | undefined): string {
  if (!code) return "—";
  const m = /^([A-Za-z0-9]+)-(\d+)$/.exec(code.trim());
  if (!m) return code;
  const area = m[1].replace(/^I$/i, "ɪ");
  return `${area}${parseInt(m[2], 10)}`;
}

/** Misma lectura para voz TTS (ɪ → I). */
export function speakTicketCode(code: string | null | undefined): string {
  return formatTicketCode(code).replace(/ɪ/g, "I");
}

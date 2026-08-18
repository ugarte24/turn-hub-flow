import type { ReactNode } from "react";

/** Formats ticket codes without hyphen or leading zeros: V-002 → V2.
 *  Usa I latina; la tipografía slab (font-ticket) la distingue del 1. */
export function formatTicketCode(code: string | null | undefined): string {
  if (!code) return "—";
  const m = /^([A-Za-z0-9]+)-(\d+)$/.exec(code.trim());
  if (!m) return code;
  return `${m[1].toUpperCase()}${parseInt(m[2], 10)}`;
}

/** Lectura para voz TTS: V6 → "ve seis" (no "uve"). */
export function speakTicketCode(code: string | null | undefined): string {
  const formatted = formatTicketCode(code);
  if (!formatted || formatted === "—") return formatted;
  const m = /^([A-Za-z]+)(\d+)$/.exec(formatted);
  if (!m) return formatted;
  const letters = m[1]
    .toUpperCase()
    .split("")
    .map((ch) => SPEAK_LETTERS[ch] ?? ch.toLowerCase())
    .join(" ");
  return `${letters} ${numberToSpanish(parseInt(m[2], 10))}`;
}

const SPEAK_LETTERS: Record<string, string> = {
  A: "a", B: "be", C: "ce", D: "de", E: "e", F: "efe", G: "ge", H: "hache",
  I: "i", J: "jota", K: "ka", L: "ele", M: "eme", N: "ene", O: "o", P: "pe",
  Q: "cu", R: "erre", S: "ese", T: "te", U: "u", V: "ve", W: "doble ve",
  X: "equis", Y: "ye", Z: "zeta",
};

function numberToSpanish(n: number): string {
  const units = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];
  const teens = ["diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve"];
  const tens = ["", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
  if (n < 10) return units[n];
  if (n < 20) return teens[n - 10];
  if (n < 30) return n === 20 ? "veinte" : `veinti${units[n - 20]}`;
  if (n < 100) {
    const u = n % 10;
    return u === 0 ? tens[Math.floor(n / 10)] : `${tens[Math.floor(n / 10)]} y ${units[u]}`;
  }
  return String(n);
}

/** Código de turno (tipografía slab vía font-ticket en el contenedor). */
export function TicketCodeView({
  code,
  className,
}: {
  code?: string | null;
  className?: string;
}): ReactNode {
  const text = formatTicketCode(code);
  return className ? <span className={className}>{text}</span> : text;
}

/** HTML para impresión térmica. */
export function formatTicketCodeHtml(code: string | null | undefined): string {
  return formatTicketCode(code);
}

import type { ReactNode } from "react";

/** Formats ticket codes without hyphen or leading zeros: V-002 → V2.
 *  Usa I latina; la tipografía slab (font-ticket) la distingue del 1. */
export function formatTicketCode(code: string | null | undefined): string {
  if (!code) return "—";
  const m = /^([A-Za-z0-9]+)-(\d+)$/.exec(code.trim());
  if (!m) return code;
  return `${m[1].toUpperCase()}${parseInt(m[2], 10)}`;
}

/** Lectura para voz TTS. */
export function speakTicketCode(code: string | null | undefined): string {
  return formatTicketCode(code);
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

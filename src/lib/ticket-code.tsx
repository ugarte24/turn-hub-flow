import type { ReactNode } from "react";

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

/** Código con ɪ a la misma altura visual que el dígito. */
export function TicketCodeView({
  code,
  className,
}: {
  code?: string | null;
  className?: string;
}): ReactNode {
  const text = formatTicketCode(code);
  if (!text.startsWith("ɪ")) {
    return className ? <span className={className}>{text}</span> : text;
  }
  return (
    <span className={className}>
      <span className="ticket-code-i">ɪ</span>
      {text.slice(1)}
    </span>
  );
}

/** HTML para impresión térmica (ɪ a la misma altura que el número). */
export function formatTicketCodeHtml(code: string | null | undefined): string {
  const text = formatTicketCode(code);
  if (!text.startsWith("ɪ")) return text;
  return `<span class="ticket-code-i">ɪ</span>${text.slice(1)}`;
}

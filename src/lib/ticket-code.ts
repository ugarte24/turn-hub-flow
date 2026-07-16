/** Formats ticket codes without hyphen or leading zeros: V-002 → V2 */
export function formatTicketCode(code: string | null | undefined): string {
  if (!code) return "—";
  const m = /^([A-Za-z0-9]+)-(\d+)$/.exec(code.trim());
  if (!m) return code;
  return `${m[1]}${parseInt(m[2], 10)}`;
}

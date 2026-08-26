/** ESC/POS para ZKP8008 / térmicas 80 mm compatibles. */

export type EscPosTicketData = {
  institution?: string;
  code: string;
  area: string;
  procedure: string;
  fecha: string;
  hora: string;
  autoCut?: boolean;
};

function encoder(): TextEncoder {
  return new TextEncoder();
}

/** Quita tildes para code page básica (más compatible en térmicas). */
export function toPrinterAscii(input: string): string {
  return input
    .replace(/[áàäâã]/gi, "a")
    .replace(/[éèëê]/gi, "e")
    .replace(/[íìïî]/gi, "i")
    .replace(/[óòöôõ]/gi, "o")
    .replace(/[úùüû]/gi, "u")
    .replace(/ñ/gi, "n")
    .replace(/ç/gi, "c")
    .replace(/[^\x20-\x7E\n]/g, "");
}

function concat(chunks: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const c of chunks) len += c.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

function cmd(...bytes: number[]): Uint8Array {
  return new Uint8Array(bytes);
}

function text(s: string): Uint8Array {
  return encoder().encode(toPrinterAscii(s));
}

function line(s = ""): Uint8Array {
  return text(`${s}\n`);
}

/** Construye el ticket + feed + corte parcial (si autoCut). */
export function buildTicketEscPos(data: EscPosTicketData): Uint8Array {
  const institution = data.institution?.trim() || "Jefatura de Recaudaciones";
  const cut = data.autoCut !== false;
  const chunks: Uint8Array[] = [];

  // Init
  chunks.push(cmd(0x1b, 0x40));
  // Code page PC437 (default)
  chunks.push(cmd(0x1b, 0x74, 0x00));
  // Center
  chunks.push(cmd(0x1b, 0x61, 0x01));
  // Normal size
  chunks.push(cmd(0x1d, 0x21, 0x00));

  chunks.push(line(institution.toUpperCase()));
  chunks.push(line("SIGAT - Comprobante de turno"));
  chunks.push(line("--------------------------------"));
  chunks.push(line("NUMERO DE TURNO"));

  // Double width + height for ticket code
  chunks.push(cmd(0x1d, 0x21, 0x11));
  chunks.push(line(data.code));
  chunks.push(cmd(0x1d, 0x21, 0x00));

  chunks.push(line("--------------------------------"));
  // Left align for details
  chunks.push(cmd(0x1b, 0x61, 0x00));
  chunks.push(line(`Area: ${data.area}`));
  chunks.push(line(`Tramite: ${data.procedure}`));
  chunks.push(line(`Fecha: ${data.fecha}`));
  chunks.push(line(`Hora: ${data.hora}`));

  chunks.push(cmd(0x1b, 0x61, 0x01));
  chunks.push(line("--------------------------------"));
  chunks.push(line("Espere su llamado en la pantalla"));
  // Feed before cut
  chunks.push(cmd(0x1b, 0x64, 0x04));

  if (cut) {
    // GS V 1 — partial cut (ZKP8008 / ESC-POS)
    chunks.push(cmd(0x1d, 0x56, 0x01));
  } else {
    chunks.push(cmd(0x1b, 0x64, 0x02));
  }

  return concat(chunks);
}

export function uint8ToBase64(bytes: Uint8Array): string {
  // btoa sin saltos de línea (equivalente a Base64.NO_WRAP de Android)
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

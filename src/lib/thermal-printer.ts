/** Config e impresión térmica vía RawBT (Android) — ESC/POS con corte. */

import { buildTicketEscPos, uint8ToBase64, type EscPosTicketData } from "@/lib/escpos-ticket";

export type ThermalPrinterSettings = {
  enabled: boolean;
  /** Corte automático al final (comando ESC/POS) */
  autoCut: boolean;
};

export const DEFAULT_THERMAL_PRINTER: ThermalPrinterSettings = {
  enabled: false,
  autoCut: true,
};

export function parseThermalPrinterSettings(raw: unknown): ThermalPrinterSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    enabled: o.enabled === true,
    autoCut: o.autoCut !== false,
  };
}

export type TicketPrintInput = {
  code: string;
  area?: string | null;
  procedure?: string | null;
  created_at?: string | null;
  institution?: string;
};

function formatTicketParts(t: TicketPrintInput) {
  const created = t.created_at ? new Date(t.created_at) : new Date();
  const dd = String(created.getDate()).padStart(2, "0");
  const mm = String(created.getMonth() + 1).padStart(2, "0");
  const yyyy = String(created.getFullYear());
  const fecha = `${dd}/${mm}/${yyyy}`;
  const hora = created.toLocaleTimeString("es-BO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return {
    fecha,
    hora,
    area: t.area?.trim() || "—",
    procedure: t.procedure?.trim() || "—",
  };
}

export function buildEscPosForTicket(
  t: TicketPrintInput,
  settings: Pick<ThermalPrinterSettings, "autoCut"> & { institution?: string },
): Uint8Array {
  const parts = formatTicketParts(t);
  const data: EscPosTicketData = {
    institution: t.institution || settings.institution,
    code: t.code,
    area: parts.area,
    procedure: parts.procedure,
    fecha: parts.fecha,
    hora: parts.hora,
    autoCut: settings.autoCut,
  };
  return buildTicketEscPos(data);
}

function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

/**
 * RawBT espera: rawbt:base64,<data> (sin encodeURIComponent: rompe +/ → "wrong base64").
 * En Chrome Android: intent:base64,<data>#Intent;scheme=rawbt;package=...;end;
 * Usar setAttribute('href') — asignar a.href percent-encodea + y /.
 */
function printViaRawBt(bytes: Uint8Array): void {
  const b64 = uint8ToBase64(bytes);
  const rawbtUrl = `rawbt:base64,${b64}`;
  const intentUrl =
    `intent:base64,${b64}` +
    "#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;";
  // En Android Chrome el Intent es el más fiable; rawbt: directo en el resto
  const url = isAndroid() ? intentUrl : rawbtUrl;

  const a = document.createElement("a");
  a.setAttribute("href", url);
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export type ThermalPrintResult = {
  method: "rawbt";
};

/**
 * Imprime por RawBT (Android). La impresora se configura dentro de la app RawBT (IP/BT/USB).
 */
export async function printTicketThermal(
  t: TicketPrintInput,
  settings: ThermalPrinterSettings,
): Promise<ThermalPrintResult> {
  if (!settings.enabled) {
    throw new Error("La impresora térmica no está habilitada en Configuración");
  }
  if (!isAndroid()) {
    throw new Error(
      "La impresión ESC/POS con RawBT solo funciona en Android. En PC usá el diálogo de impresión del navegador.",
    );
  }

  const bytes = buildEscPosForTicket(t, settings);
  printViaRawBt(bytes);
  return { method: "rawbt" };
}

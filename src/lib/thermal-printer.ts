/** Config e impresión térmica por red (ZKP8008 ESC/POS). */

import {
  base64ToUint8,
  buildTicketEscPos,
  uint8ToBase64,
  type EscPosTicketData,
} from "@/lib/escpos-ticket";

export type ThermalPrinterSettings = {
  enabled: boolean;
  /** IP de la ZKP8008 en la LAN, ej. 192.168.1.50 */
  host: string;
  /** Puerto Raw (casi siempre 9100) */
  port: number;
  /** Corte automático al final */
  autoCut: boolean;
  /** Imprimir al generar turno en Host */
  autoPrint: boolean;
  /**
   * URL del agente local en la oficina, ej. http://192.168.1.10:8787
   * El celular/PC en la WiFi llama al agente; el agente habla TCP con la impresora.
   * Necesario si SIGAT está en Vercel (la nube no llega a la LAN).
   */
  agentUrl: string;
};

export const DEFAULT_THERMAL_PRINTER: ThermalPrinterSettings = {
  enabled: false,
  host: "",
  port: 9100,
  autoCut: true,
  autoPrint: true,
  agentUrl: "",
};

export function parseThermalPrinterSettings(raw: unknown): ThermalPrinterSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const port = Number(o.port);
  return {
    enabled: o.enabled === true,
    host: typeof o.host === "string" ? o.host.trim() : "",
    port: Number.isFinite(port) && port > 0 && port < 65536 ? port : 9100,
    autoCut: o.autoCut !== false,
    autoPrint: o.autoPrint !== false,
    agentUrl: typeof o.agentUrl === "string" ? o.agentUrl.trim().replace(/\/$/, "") : "",
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

/** Abre RawBT (Android) con el payload ESC/POS en base64. */
function printViaRawBt(bytes: Uint8Array): boolean {
  if (!isAndroid()) return false;
  try {
    const b64 = uint8ToBase64(bytes);
    // RawBT: scheme rawbt + base64 del job
    const url =
      "intent:base64," +
      encodeURIComponent(b64) +
      "#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end";
    window.location.href = url;
    return true;
  } catch {
    return false;
  }
}

async function printViaAgent(
  agentUrl: string,
  settings: ThermalPrinterSettings,
  bytes: Uint8Array,
): Promise<void> {
  const res = await fetch(`${agentUrl}/print`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      host: settings.host,
      port: settings.port,
      data: uint8ToBase64(bytes),
    }),
  });
  if (!res.ok) {
    let msg = `Agente HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
}

async function printViaApi(settings: ThermalPrinterSettings, bytes: Uint8Array): Promise<void> {
  const res = await fetch("/api/print/escpos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      host: settings.host,
      port: settings.port,
      data: uint8ToBase64(bytes),
    }),
  });
  const j = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean };
  if (!res.ok || j.error) {
    throw new Error(j.error || `Error HTTP ${res.status}`);
  }
}

export type ThermalPrintResult = {
  method: "agent" | "api" | "rawbt";
};

/**
 * Imprime por red con corte.
 * Orden: agente local (LAN) → API servidor → RawBT (Android).
 */
export async function printTicketThermal(
  t: TicketPrintInput,
  settings: ThermalPrinterSettings,
): Promise<ThermalPrintResult> {
  if (!settings.enabled) {
    throw new Error("La impresora térmica no está habilitada en Configuración");
  }

  const bytes = buildEscPosForTicket(t, settings);

  if (settings.agentUrl) {
    await printViaAgent(settings.agentUrl, settings, bytes);
    return { method: "agent" };
  }

  if (settings.host) {
    try {
      await printViaApi(settings, bytes);
      return { method: "api" };
    } catch (e) {
      // Si la API falla (típico en Vercel → LAN) y hay Android, RawBT
      if (printViaRawBt(bytes)) return { method: "rawbt" };
      throw e;
    }
  }

  if (printViaRawBt(bytes)) return { method: "rawbt" };

  throw new Error(
    "Configurá la IP de la impresora o la URL del agente local (PC en la oficina).",
  );
}

export function bytesFromBase64(b64: string): Uint8Array {
  return base64ToUint8(b64);
}

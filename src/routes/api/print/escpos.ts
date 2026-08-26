import { createFileRoute } from "@tanstack/react-router";
import net from "node:net";
import { base64ToUint8 } from "@/lib/escpos-ticket";

function sendTcp(host: string, port: number, data: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port }, () => {
      socket.write(Buffer.from(data), (err) => {
        if (err) {
          socket.destroy();
          reject(err);
          return;
        }
        socket.end();
      });
    });
    socket.setTimeout(8000);
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("Timeout al conectar con la impresora"));
    });
    socket.on("error", reject);
    socket.on("close", () => resolve());
  });
}

export const Route = createFileRoute("/api/print/escpos")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            host?: string;
            port?: number;
            data?: string;
          };
          const host = String(body.host ?? "").trim();
          const port = Number(body.port) || 9100;
          const dataB64 = String(body.data ?? "");
          if (!host) {
            return Response.json({ error: "Falta la IP de la impresora" }, { status: 400 });
          }
          // Bloquear IPs públicas accidentales no es trivial; solo LAN típica
          if (!dataB64) {
            return Response.json({ error: "Falta el contenido ESC/POS" }, { status: 400 });
          }
          const bytes = base64ToUint8(dataB64);
          await sendTcp(host, port, bytes);
          return Response.json({ ok: true });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "No se pudo imprimir";
          // En Vercel/cloud esto falla porque no llega a la LAN: mensaje claro
          const hint =
            /timeout|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|ETIMEDOUT/i.test(msg)
              ? " El servidor en la nube no alcanza impresoras de la oficina. Usá el agente local (scripts/sigat-print-agent.mjs) o RawBT en Android."
              : "";
          return Response.json({ error: msg + hint }, { status: 502 });
        }
      },
    },
  },
});

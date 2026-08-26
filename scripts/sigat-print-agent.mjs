/**
 * Agente local SIGAT → ZKP8008 (ESC/POS por TCP 9100).
 *
 * Uso en una PC de la oficina (misma WiFi/LAN que la impresora y los celulares):
 *
 *   node scripts/sigat-print-agent.mjs
 *
 * Variables opcionales:
 *   PRINTER_HOST=192.168.1.50
 *   PRINTER_PORT=9100
 *   AGENT_PORT=8787
 *
 * En SIGAT → Configuración → Impresora térmica:
 *   URL del agente: http://IP-DE-ESTA-PC:8787
 */
import http from "node:http";
import net from "node:net";

const PRINTER_HOST = (process.env.PRINTER_HOST || "").trim();
const PRINTER_PORT = Number(process.env.PRINTER_PORT || 9100);
const AGENT_PORT = Number(process.env.AGENT_PORT || 8787);

function sendToPrinter(host, port, buffer) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port }, () => {
      socket.write(buffer, (err) => {
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

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        service: "sigat-print-agent",
        printer: { host: PRINTER_HOST || "(enviar host en el POST)", port: PRINTER_PORT },
      }),
    );
    return;
  }

  if (req.method === "POST" && req.url === "/print") {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString("utf8") || "{}");
      const host = String(body.host || PRINTER_HOST || "").trim();
      const port = Number(body.port || PRINTER_PORT) || 9100;
      const dataB64 = String(body.data || "");
      if (!host) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Falta host de impresora (PRINTER_HOST o body.host)" }));
        return;
      }
      if (!dataB64) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Falta data (base64 ESC/POS)" }));
        return;
      }
      const buffer = Buffer.from(dataB64, "base64");
      await sendToPrinter(host, port, buffer);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(AGENT_PORT, "0.0.0.0", () => {
  console.log(`[sigat-print-agent] http://0.0.0.0:${AGENT_PORT}`);
  console.log(
    `[sigat-print-agent] Impresora por defecto: ${PRINTER_HOST || "(sin PRINTER_HOST)"}:${PRINTER_PORT}`,
  );
  console.log(`[sigat-print-agent] En SIGAT usá: http://IP-DE-ESTA-PC:${AGENT_PORT}`);
});

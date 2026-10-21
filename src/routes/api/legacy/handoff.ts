import { createFileRoute } from "@tanstack/react-router";
import {
  formatTicketCodeLegacy,
  handoffTicketLegacy,
  jsonError,
  requireUserId,
  userSupabaseFromRequest,
} from "@/lib/legacy-operator.server";

export const Route = createFileRoute("/api/legacy/handoff")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = userSupabaseFromRequest(request);
          if ("error" in auth) return auth.error;
          const userId = await requireUserId(auth.supabase);
          if (!userId) return jsonError("Sesión inválida", 401);

          const body = (await request.json()) as {
            ticketId?: string;
            targetServicePointId?: string;
          };
          const ticketId = String(body.ticketId ?? "");
          const targetServicePointId = String(body.targetServicePointId ?? "");
          if (!ticketId) return jsonError("Falta ticketId");
          if (!targetServicePointId) return jsonError("Falta el puesto destino");

          const ticket = await handoffTicketLegacy(auth.supabase, userId, ticketId, targetServicePointId);
          return Response.json({
            ticket: {
              id: ticket.id,
              code: ticket.code,
              displayCode: formatTicketCodeLegacy(ticket.code),
              status: ticket.status,
            },
          });
        } catch (e) {
          return jsonError(e instanceof Error ? e.message : "Error al pasar el turno", 500);
        }
      },
    },
  },
});

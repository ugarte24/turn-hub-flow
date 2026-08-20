import { createFileRoute } from "@tanstack/react-router";
import {
  formatTicketCodeLegacy,
  jsonError,
  requireUserId,
  updateTicketStatusLegacy,
  userSupabaseFromRequest,
} from "@/lib/legacy-operator.server";

export const Route = createFileRoute("/api/legacy/ticket-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = userSupabaseFromRequest(request);
          if ("error" in auth) return auth.error;
          const userId = await requireUserId(auth.supabase);
          if (!userId) return jsonError("Sesión inválida", 401);

          const body = (await request.json()) as { ticketId?: string; status?: string };
          const ticketId = String(body.ticketId ?? "");
          const status = String(body.status ?? "") as "calling" | "finished" | "absent" | "cancelled";
          if (!ticketId) return jsonError("Falta ticketId");
          if (!["calling", "finished", "absent", "cancelled"].includes(status)) {
            return jsonError("Estado no válido");
          }

          const ticket = await updateTicketStatusLegacy(auth.supabase, ticketId, status);
          return Response.json({
            ticket: {
              id: ticket.id,
              code: ticket.code,
              displayCode: formatTicketCodeLegacy(ticket.code),
              status: ticket.status,
            },
          });
        } catch (e) {
          return jsonError(e instanceof Error ? e.message : "Error al actualizar", 500);
        }
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import {
  formatTicketCodeLegacy,
  jsonError,
  requireUserId,
  returnToOriginLegacy,
  transferToCashierLegacy,
  transferToCounterLegacy,
  userSupabaseFromRequest,
} from "@/lib/legacy-operator.server";

export const Route = createFileRoute("/api/legacy/transfer")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = userSupabaseFromRequest(request);
          if ("error" in auth) return auth.error;
          const userId = await requireUserId(auth.supabase);
          if (!userId) return jsonError("Sesión inválida", 401);

          const body = (await request.json()) as { ticketId?: string; action?: string };
          const ticketId = String(body.ticketId ?? "");
          const action = String(body.action ?? "");
          if (!ticketId) return jsonError("Falta ticketId");
          if (!["counter", "cashier", "origin"].includes(action)) {
            return jsonError("Acción de derivación no válida");
          }

          let ticket;
          if (action === "counter") {
            ticket = await transferToCounterLegacy(auth.supabase, userId, ticketId);
          } else if (action === "cashier") {
            ticket = await transferToCashierLegacy(auth.supabase, userId, ticketId);
          } else {
            ticket = await returnToOriginLegacy(auth.supabase, userId, ticketId);
          }

          return Response.json({
            ticket: {
              id: ticket.id,
              code: ticket.code,
              displayCode: formatTicketCodeLegacy(ticket.code),
              status: ticket.status,
            },
            action,
          });
        } catch (e) {
          return jsonError(e instanceof Error ? e.message : "Error al derivar", 500);
        }
      },
    },
  },
});

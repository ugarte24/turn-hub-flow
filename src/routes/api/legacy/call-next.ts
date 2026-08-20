import { createFileRoute } from "@tanstack/react-router";
import {
  callNextForOperator,
  findAssignedServicePoint,
  formatTicketCodeLegacy,
  jsonError,
  requireUserId,
  userSupabaseFromRequest,
} from "@/lib/legacy-operator.server";

export const Route = createFileRoute("/api/legacy/call-next")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = userSupabaseFromRequest(request);
          if ("error" in auth) return auth.error;
          const userId = await requireUserId(auth.supabase);
          if (!userId) return jsonError("Sesión inválida", 401);

          const assigned = await findAssignedServicePoint(auth.supabase, userId);
          if (!assigned) return jsonError("No tenés un puesto asignado");
          if (!assigned.active) return jsonError("Tu puesto está inactivo");

          const ticket = await callNextForOperator(auth.supabase, userId, assigned.id);
          if (!ticket) {
            return Response.json({ ticket: null, message: "No hay turnos en espera" });
          }
          return Response.json({
            ticket: {
              id: ticket.id,
              code: ticket.code,
              displayCode: formatTicketCodeLegacy(ticket.code),
              status: ticket.status,
            },
          });
        } catch (e) {
          return jsonError(e instanceof Error ? e.message : "Error al llamar", 500);
        }
      },
    },
  },
});

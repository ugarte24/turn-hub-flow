import { createFileRoute } from "@tanstack/react-router";
import {
  getOperatorState,
  jsonError,
  requireUserId,
  userSupabaseFromRequest,
} from "@/lib/legacy-operator.server";

export const Route = createFileRoute("/api/legacy/state")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const auth = userSupabaseFromRequest(request);
          if ("error" in auth) return auth.error;
          const userId = await requireUserId(auth.supabase);
          if (!userId) return jsonError("Sesión inválida", 401);
          const state = await getOperatorState(auth.supabase, userId);
          return Response.json(state);
        } catch (e) {
          return jsonError(e instanceof Error ? e.message : "Error al cargar", 500);
        }
      },
    },
  },
});

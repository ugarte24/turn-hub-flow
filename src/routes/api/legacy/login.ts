import { createFileRoute } from "@tanstack/react-router";
import {
  findAssignedServicePoint,
  jsonError,
  publicSupabase,
} from "@/lib/legacy-operator.server";

export const Route = createFileRoute("/api/legacy/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { email?: string; password?: string };
          const email = String(body.email ?? "").trim();
          const password = String(body.password ?? "");
          if (!email || !password) return jsonError("Completá correo y contraseña");

          const sb = publicSupabase();
          const { data, error } = await sb.auth.signInWithPassword({ email, password });
          if (error || !data.session || !data.user) {
            return jsonError(error?.message || "Correo o contraseña incorrectos", 401);
          }

          const userId = data.user.id;
          const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", userId);
          const roleList = (roles ?? []).map((r) => r.role);
          const canOperate =
            roleList.includes("operator") || roleList.includes("admin") || roleList.length === 0;
          if (!canOperate) {
            return jsonError("Esta cuenta no es de operador. Usá Windows 10/11 para admin u host.", 403);
          }

          const assigned = await findAssignedServicePoint(sb, userId);
          return Response.json({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_in: data.session.expires_in,
            user: { id: userId, email: data.user.email },
            servicePoint: assigned
              ? { id: assigned.id, name: assigned.name, active: assigned.active }
              : null,
          });
        } catch (e) {
          return jsonError(e instanceof Error ? e.message : "Error al iniciar sesión", 500);
        }
      },
    },
  },
});

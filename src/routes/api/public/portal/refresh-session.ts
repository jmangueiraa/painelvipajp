import { createFileRoute } from "@tanstack/react-router";
import { portalCorsHeaders, portalOptions } from "@/lib/portal-cors";

function json(data: unknown, request: Request, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      ...portalCorsHeaders(request),
      ...(init?.headers ?? {}),
    },
  });
}

export const Route = createFileRoute("/api/public/portal/refresh-session")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => portalOptions(request),
      POST: async ({ request }) => {
        try {
          const portalAdmin = await import("@/lib/portal-admin.server");
          const auth = request.headers.get("authorization") || request.headers.get("Authorization");
          let token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : (auth || "").trim();
          if (!token) {
            token = (request.headers.get("x-portal-token") || request.headers.get("X-Portal-Token") || "").trim();
          }
          if (!token) {
            const body = await request.json().catch(() => ({}));
            if (body && typeof body === "object" && (body as any).token) {
              token = String((body as any).token).trim();
            }
          }

          if (!token) {
            return json({ ok: false, error: "Token ausente", fatal: true }, request, { status: 401 });
          }

          // 1. Sessão de administrador (adm.)
          if (token.startsWith("adm.")) {
            const admin = portalAdmin.verifyAdminToken(token);
            if (!admin) {
              return json({ ok: false, error: "Sessão administrativa expirada ou inválida", fatal: true }, request, { status: 401 });
            }
            const fresh = portalAdmin.createAdminSession(admin.username);
            return json({ ok: true, token: fresh.token, expires_at: fresh.expires_at, is_admin: true }, request);
          }

          // 2. Sessão de cliente do portal
          const portal = await import("@/integrations/portal/session.server");
          const client = await portal.getSessionFromRequest(request, token);
          if (!client) {
            return json({ ok: false, error: "Sessão inválida ou revogada", fatal: true }, request, { status: 401 });
          }

          const extendedExpires = await portal.touchSession(token);
          return json({
            ok: true,
            token,
            expires_at: extendedExpires || new Date(Date.now() + portal.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
            client: {
              id: client.id,
              name: client.name,
              phone: client.phone,
              due_date: client.due_date,
              status: client.status,
            },
          }, request);
        } catch (err) {
          console.error("[portal refresh-session error]", err);
          return json({ ok: false, error: (err as Error).message }, request, { status: 500 });
        }
      },
      GET: async ({ request }) => {
        try {
          const portalAdmin = await import("@/lib/portal-admin.server");
          const auth = request.headers.get("authorization") || request.headers.get("Authorization");
          let token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : (auth || "").trim();
          if (!token) {
            token = (request.headers.get("x-portal-token") || request.headers.get("X-Portal-Token") || "").trim();
          }
          if (!token) {
            return json({ ok: false, error: "Token ausente", fatal: true }, request, { status: 401 });
          }

          if (token.startsWith("adm.")) {
            const admin = portalAdmin.verifyAdminToken(token);
            if (!admin) {
              return json({ ok: false, error: "Sessão administrativa expirada ou inválida", fatal: true }, request, { status: 401 });
            }
            const fresh = portalAdmin.createAdminSession(admin.username);
            return json({ ok: true, token: fresh.token, expires_at: fresh.expires_at, is_admin: true }, request);
          }

          const portal = await import("@/integrations/portal/session.server");
          const client = await portal.getSessionFromRequest(request, token);
          if (!client) {
            return json({ ok: false, error: "Sessão inválida ou revogada", fatal: true }, request, { status: 401 });
          }

          const extendedExpires = await portal.touchSession(token);
          return json({
            ok: true,
            token,
            expires_at: extendedExpires || new Date(Date.now() + portal.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
          }, request);
        } catch (err) {
          return json({ ok: false, error: (err as Error).message }, request, { status: 500 });
        }
      },
    },
  },
});

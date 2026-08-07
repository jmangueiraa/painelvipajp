import { createFileRoute } from "@tanstack/react-router";
import { portalCorsHeaders, portalOptions } from "@/lib/portal-cors";

function json(data: unknown, request: Request, init?: ResponseInit) {
  return Response.json(data, { ...init, headers: { "Cache-Control": "no-store", ...portalCorsHeaders(request), ...(init?.headers ?? {}) } });
}

export const Route = createFileRoute("/api/public/portal/ai-agent-chat")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => portalOptions(request),
      POST: async ({ request }) => {
        try {
          const portal = await import("@/integrations/portal/session.server");
          const client = await portal.getSessionFromRequest(request);
          if (!client) return json({ error: "Sessão inválida" }, request, { status: 401 });

          const body = await request.json();
          const { processAgentMessage } = await import("@/routes/_authenticated/ai-agent.functions");
          
          const result = await processAgentMessage({ data: body });
          return json(result, request);
        } catch (e) {
          return json({ error: (e as Error).message }, request, { status: 500 });
        }
      }
    }
  }
});

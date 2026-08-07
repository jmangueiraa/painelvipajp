import { createFileRoute } from "@tanstack/react-router";
import { portalCorsHeaders, portalOptions } from "@/lib/portal-cors";

function json(data: unknown, request: Request, init?: ResponseInit) {
  return Response.json(data, { ...init, headers: { "Cache-Control": "no-store", ...portalCorsHeaders(request), ...(init?.headers ?? {}) } });
}

export const Route = createFileRoute("/api/public/portal/public-ai-agent")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => portalOptions(request),
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const { processAgentMessage } = await import("@/routes/_authenticated/ai-agent.functions");
          
          console.log("[Public AI Agent] Processing message:", body.message);
          const result = await (processAgentMessage as any).handler({ data: { ...body, public: true } });
          console.log("[Public AI Agent] Result:", !!result);
          
          return json(result, request);
        } catch (e) {
          console.error("[Public AI Agent] Error:", e);
          return json({ error: (e as Error).message }, request, { status: 500 });
        }
      }
    }
  }
});

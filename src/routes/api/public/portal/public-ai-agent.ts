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
          
          // For public access, we don't check portal session
          // We can add rate limiting or other checks here if needed
          const result = await processAgentMessage({ data: { ...body, public: true } });
          return json(result, request);
        } catch (e) {
          return json({ error: (e as Error).message }, request, { status: 500 });
        }
      }
    }
  }
});

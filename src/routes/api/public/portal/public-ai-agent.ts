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
          const { processAgentMessageLogic } = await import("@/lib/ai-agent.server");
          
          console.log("[Public AI Agent] Body:", JSON.stringify(body));
          
          // Call the logic directly to bypass Start context requirements in raw API routes
          const result = await processAgentMessageLogic({ 
            sessionId: body.sessionId || "public-session",
            message: body.message || "",
            history: body.history || [],
            public: true 
          });
          
          console.log("[Public AI Agent] Result received:", !!result);
          return json(result, request);
        } catch (e) {
          console.error("[Public AI Agent] Error:", e);
          return json({ error: (e as Error).message }, request, { status: 500 });
        }
      }
    }
  }
});

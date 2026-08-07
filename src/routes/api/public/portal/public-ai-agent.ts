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
          
          console.log("[Public AI Agent] Body:", JSON.stringify(body));
          
          // Use the server function directly. Since we are in a server route, 
          // we can call it. TanStack Start server functions are callable.
          // Correct way to execute a server function internal logic in TanStack Start
          const result = await (processAgentMessage as any).__executeServer({ 
            data: {
              sessionId: body.sessionId || "public-session",
              message: body.message || "",
              history: body.history || [],
              public: true 
            }
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

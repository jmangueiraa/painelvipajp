import { createFileRoute } from "@tanstack/react-router";
import { portalCorsHeaders, portalOptions } from "@/lib/portal-cors";

function json(data: unknown, request: Request, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: { "Cache-Control": "no-store", ...portalCorsHeaders(request), ...(init?.headers ?? {}) },
  });
}

export const Route = createFileRoute("/api/public/portal/track-ref")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => portalOptions(request),
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as {
            code?: string;
            clientId?: string;
          };

          const code = (body.code || "").trim().toUpperCase();
          if (!code) return json({ ok: false, error: "Código vazio" }, request, { status: 400 });

          const { trackPartnerReferralClick, linkClientToPartnerCode } = await import("@/lib/ajp-indica.server");

          const clientIp = request.headers.get("x-forwarded-for") || request.headers.get("cf-connecting-ip") || null;
          const userAgent = request.headers.get("user-agent") || null;
          const referer = request.headers.get("referer") || null;

          const trackResult = await trackPartnerReferralClick({
            code,
            ip: clientIp,
            userAgent,
            referer,
          });

          if (body.clientId && trackResult.valid) {
            await linkClientToPartnerCode(body.clientId, code);
          }

          return json({ ok: true, valid: trackResult.valid, partnerName: trackResult.partnerName }, request);
        } catch (e: any) {
          return json({ ok: false, error: e?.message }, request, { status: 500 });
        }
      },
    },
  },
});

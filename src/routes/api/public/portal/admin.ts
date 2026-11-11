import { createFileRoute } from "@tanstack/react-router";
import { portalCorsHeaders, portalOptions } from "@/lib/portal-cors";

function json(data: unknown, request: Request, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...portalCorsHeaders(request),
      ...(init?.headers ?? {}),
    },
  });
}

function isRlsOrPermissionError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const code = err.code ?? "";
  const msg = (err.message ?? "").toLowerCase();
  return (
    code === "42501" ||
    msg.includes("row-level security") ||
    msg.includes("permission denied") ||
    msg.includes("policy")
  );
}

const ALLOWED_SETTINGS_KEYS = [
  "whatsapp_instance",
  "support_message",
  "mp_access_token",
  "telegram_bot_token",
  "telegram_chat_id",
  "zapi_instance_id",
  "zapi_token",
  "zapi_client_token",
  "app_android_url",
  "app_ios_url",
  "updates_movies_text",
  "updates_series_text",
  "updates_games_text",
  "store_slug",
  "store_title",
  "store_description",
  "pix_key",
  "pix_name",
  "pix_bank",
  "referral_enabled",
] as const;

export const Route = createFileRoute("/api/public/portal/admin")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => portalOptions(request),

      GET: async ({ request }) => {
        try {
          const portalAdmin = await import("@/lib/portal-admin.server");
          const token = portalAdmin.extractPortalToken(request);
          const admin = portalAdmin.verifyAdminToken(token);
          if (!admin) {
            return json({ error: "Acesso restrito ao administrador." }, request, { status: 401 });
          }

          const snapshot = await portalAdmin.getAdminFullSnapshot();
          return json({ ok: true, admin, ...snapshot }, request);
        } catch (e) {
          return json({ error: (e as Error).message || "Erro ao carregar painel ADM" }, request, {
            status: 500,
          });
        }
      },

      POST: async ({ request }) => {
        try {
          const portalAdmin = await import("@/lib/portal-admin.server");
          const token = portalAdmin.extractPortalToken(request);
          const admin = portalAdmin.verifyAdminToken(token);
          if (!admin) {
            return json({ error: "Acesso restrito ao administrador." }, request, { status: 401 });
          }

          const body = (await request.json().catch(() => ({}))) as {
            action?: string;
            [key: string]: any;
          };
          const action = (body.action ?? "").trim();
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const ownerId = await portalAdmin.resolveAdminOwnerId();
          const rpcKey = portalAdmin.getRpcAdminKey();

          if (action === "create_client" || action === "update_client") {
            const name = String(body.name ?? "").trim();
            const phone = String(body.phone ?? "").trim();
            const dueDate = String(body.due_date ?? "").trim() || portalAdmin.todayIsoSP();
            if (name.length < 2) return json({ error: "Informe o nome do cliente." }, request, { status: 400 });
            if (phone.length < 8) return json({ error: "Informe o WhatsApp válido." }, request, { status: 400 });

            const rawStatus = (body.status as any) || "ativo";
            const status =
              rawStatus === "suspenso" || rawStatus === "cancelado"
                ? rawStatus
                : portalAdmin.computeStatusSP(dueDate, "ativo");

            let referredBy: string | null | undefined = undefined;
            let partnerId: string | null | undefined = undefined;
            let partnerCode: string | null | undefined = undefined;
            const refCode = String(body.referred_by_code ?? "").trim().toUpperCase();
            if (refCode) {
              const { data: partnerMatch } = await (supabaseAdmin as any)
                .from("partners")
                .select("id,code")
                .eq("code", refCode)
                .maybeSingle();
              if (partnerMatch) {
                partnerId = partnerMatch.id;
                partnerCode = partnerMatch.code;
                referredBy = null;
              } else {
                const { data: clientMatch } = await supabaseAdmin
                  .from("clients")
                  .select("id")
                  .eq("referral_code", refCode)
                  .maybeSingle();
                if (!clientMatch) {
                  return json({ error: "Código de indicação não encontrado." }, request, { status: 400 });
                }
                referredBy = clientMatch.id;
                partnerId = null;
                partnerCode = null;
              }
            } else if (body.clear_referral === true) {
              referredBy = null;
              partnerId = null;
              partnerCode = null;
            }

            const payload: Record<string, any> = {
              user_id: ownerId,
              name,
              phone,
              iptv_login: body.iptv_login ? String(body.iptv_login).trim() : null,
              iptv_password: body.iptv_password ? String(body.iptv_password).trim() : null,
              plan_id: body.plan_id || null,
              server_id: body.server_id || null,
              price_cents: Math.max(0, Number(body.price_cents) || 0),
              points: Math.max(1, Math.min(10, Number(body.points) || 1)),
              due_date: dueDate,
              status,
              auto_charge: body.auto_charge !== false,
              notes: body.notes ? String(body.notes).trim() : null,
            };
            if (referredBy !== undefined) payload.referred_by = referredBy;
            if (partnerId !== undefined) payload.partner_id = partnerId;
            if (partnerCode !== undefined) payload.partner_code = partnerCode;

            if (action === "update_client") {
              const id = String(body.id ?? "").trim();
              if (!id) return json({ error: "ID do cliente ausente." }, request, { status: 400 });
              const { error } = await (supabaseAdmin.from("clients") as any).update(payload).eq("id", id);
              if (!error) return json({ ok: true }, request);

              if (isRlsOrPermissionError(error)) {
                const { error: rpcErr } = await (supabaseAdmin.rpc as any)("portal_admin_upsert_client", {
                  _admin_key: rpcKey,
                  _owner_id: ownerId,
                  _id: id,
                  _payload: payload,
                });
                if (!rpcErr) return json({ ok: true }, request);
                return json({ error: rpcErr.message || error.message }, request, { status: 403 });
              }
              return json({ error: error.message }, request, { status: 400 });
            }

            const { error } = await (supabaseAdmin.from("clients") as any).insert(payload);
            if (!error) return json({ ok: true }, request);

            if (isRlsOrPermissionError(error)) {
              const { error: rpcErr } = await (supabaseAdmin.rpc as any)("portal_admin_upsert_client", {
                _admin_key: rpcKey,
                _owner_id: ownerId,
                _id: null,
                _payload: payload,
              });
              if (!rpcErr) return json({ ok: true }, request);
              return json(
                {
                  error:
                    "Permissão de escrita bloqueada pelo RLS do Supabase para novo cliente. Execute a migration 20261111_portal_admin.sql no SQL Editor do Supabase.",
                },
                request,
                { status: 403 },
              );
            }
            return json({ error: error.message }, request, { status: 400 });
          }

          if (action === "renew_client") {
            const clientId = String(body.client_id ?? "").trim();
            const days = Math.max(1, Number(body.days) || 30);
            const amountCents =
              body.amount_cents !== undefined && body.amount_cents !== null
                ? Math.max(0, Number(body.amount_cents))
                : null;
            if (!clientId) return json({ error: "Cliente inválido." }, request, { status: 400 });

            const { data: rpcRes, error } = await (supabaseAdmin.rpc as any)(
              "portal_finalize_client_renewal",
              {
                _client_id: clientId,
                _days: days,
                _user_id: ownerId,
                _amount_cents: amountCents,
                _notes: String(body.notes ?? "Renovação via Painel ADM Portal"),
              },
            );
            if (error) return json({ error: error.message }, request, { status: 400 });
            if (rpcRes && typeof rpcRes === "object" && (rpcRes as any).success === false) {
              return json({ error: (rpcRes as any).error || "Erro ao renovar cliente." }, request, {
                status: 400,
              });
            }
            return json({ ok: true, result: rpcRes }, request);
          }

          if (action === "toggle_client_status") {
            const id = String(body.id ?? "").trim();
            const dueDate = String(body.due_date ?? "").trim() || portalAdmin.todayIsoSP();
            const nextSuspended = Boolean(body.suspend);
            if (!id) return json({ error: "Cliente inválido." }, request, { status: 400 });
            const status = nextSuspended ? "suspenso" : portalAdmin.computeStatusSP(dueDate, "ativo");
            const { error } = await supabaseAdmin.from("clients").update({ status }).eq("id", id);
            if (error) return json({ error: error.message }, request, { status: 400 });
            return json({ ok: true, status }, request);
          }

          if (action === "delete_client") {
            const id = String(body.id ?? "").trim();
            if (!id) return json({ error: "Cliente inválido." }, request, { status: 400 });
            const { error } = await supabaseAdmin.from("clients").delete().eq("id", id);
            if (!error) return json({ ok: true }, request);

            if (isRlsOrPermissionError(error)) {
              const { error: rpcErr } = await (supabaseAdmin.rpc as any)("portal_admin_delete_client", {
                _admin_key: rpcKey,
                _id: id,
              });
              if (!rpcErr) return json({ ok: true }, request);
              return json(
                {
                  error:
                    "Exclusão bloqueada pelo RLS do Supabase. Execute a migration 20261111_portal_admin.sql no SQL Editor.",
                },
                request,
                { status: 403 },
              );
            }
            return json({ error: error.message }, request, { status: 400 });
          }

          if (action === "save_settings") {
            const patchInput = (body.patch ?? {}) as Record<string, any>;
            const patch: Record<string, any> = {};
            const nowISO = new Date().toISOString();

            for (const key of ALLOWED_SETTINGS_KEYS) {
              if (key in patchInput) {
                if (key === "referral_enabled") {
                  patch[key] = Boolean(patchInput[key]);
                } else {
                  const val = patchInput[key];
                  patch[key] = val === null || val === undefined || String(val).trim() === "" ? null : String(val).trim();
                }
              }
            }
            if ("updates_movies_text" in patch) patch.updates_movies_updated_at = nowISO;
            if ("updates_series_text" in patch) patch.updates_series_updated_at = nowISO;
            if ("updates_games_text" in patch) patch.updates_games_updated_at = nowISO;

            if (Object.keys(patch).length === 0) {
              return json({ error: "Nenhuma alteração enviada." }, request, { status: 400 });
            }

            const { error } = await (supabaseAdmin.from("settings") as any).update(patch).eq("user_id", ownerId);
            if (error) return json({ error: error.message }, request, { status: 400 });
            return json({ ok: true }, request);
          }

          if (action === "upsert_product") {
            const label = String(body.label ?? "").trim();
            if (!label) return json({ error: "Nome do produto obrigatório." }, request, { status: 400 });
            const key =
              String(body.key ?? "").trim() ||
              label
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "") ||
              `prod-${Date.now()}`;

            const payload = {
              user_id: ownerId,
              key,
              label,
              sale_cents: Math.max(0, Number(body.sale_cents) || 0),
              cost_cents: Math.max(0, Number(body.cost_cents) || 0),
              duration_days: Math.max(1, Number(body.duration_days) || 30),
              emoji: String(body.emoji ?? "🛒").trim() || "🛒",
              gradient: String(body.gradient ?? "from-emerald-500 to-teal-600"),
              active: body.active !== false,
              image_url: body.image_url ? String(body.image_url).trim() : null,
            };

            const id = body.id ? String(body.id).trim() : null;
            const { error } = id
              ? await supabaseAdmin.from("store_products").update(payload).eq("id", id)
              : await supabaseAdmin.from("store_products").insert(payload);

            if (!error) return json({ ok: true }, request);

            if (isRlsOrPermissionError(error)) {
              const { error: rpcErr } = await (supabaseAdmin.rpc as any)("portal_admin_upsert_product", {
                _admin_key: rpcKey,
                _owner_id: ownerId,
                _id: id,
                _payload: payload,
              });
              if (!rpcErr) return json({ ok: true }, request);
              return json(
                {
                  error:
                    "Permissão de escrita na Loja bloqueada pelo RLS. Execute a migration 20261111_portal_admin.sql no Supabase.",
                },
                request,
                { status: 403 },
              );
            }
            return json({ error: error.message }, request, { status: 400 });
          }

          if (action === "delete_product") {
            const id = String(body.id ?? "").trim();
            if (!id) return json({ error: "Produto inválido." }, request, { status: 400 });
            const { error } = await supabaseAdmin.from("store_products").delete().eq("id", id);
            if (!error) return json({ ok: true }, request);
            if (isRlsOrPermissionError(error)) {
              const { error: rpcErr } = await (supabaseAdmin.rpc as any)("portal_admin_delete_product", {
                _admin_key: rpcKey,
                _id: id,
              });
              if (!rpcErr) return json({ ok: true }, request);
            }
            return json({ error: error.message }, request, { status: 400 });
          }

          if (action === "upsert_server") {
            const name = String(body.name ?? "").trim();
            if (!name) return json({ error: "Nome do servidor obrigatório." }, request, { status: 400 });
            const payload = {
              user_id: ownerId,
              name,
              credit_cost_cents: Math.max(0, Number(body.credit_cost_cents) || 0),
            };
            const id = body.id ? String(body.id).trim() : null;
            const { error } = id
              ? await supabaseAdmin.from("servers").update(payload).eq("id", id)
              : await supabaseAdmin.from("servers").insert(payload);

            if (!error) return json({ ok: true }, request);
            if (isRlsOrPermissionError(error)) {
              const { error: rpcErr } = await (supabaseAdmin.rpc as any)("portal_admin_upsert_server", {
                _admin_key: rpcKey,
                _owner_id: ownerId,
                _id: id,
                _payload: payload,
              });
              if (!rpcErr) return json({ ok: true }, request);
              return json(
                {
                  error:
                    "Permissão de escrita em Servidores bloqueada pelo RLS. Execute a migration 20261111_portal_admin.sql no Supabase.",
                },
                request,
                { status: 403 },
              );
            }
            return json({ error: error.message }, request, { status: 400 });
          }

          if (action === "delete_server") {
            const id = String(body.id ?? "").trim();
            if (!id) return json({ error: "Servidor inválido." }, request, { status: 400 });
            const { error } = await supabaseAdmin.from("servers").delete().eq("id", id);
            if (!error) return json({ ok: true }, request);
            if (isRlsOrPermissionError(error)) {
              const { error: rpcErr } = await (supabaseAdmin.rpc as any)("portal_admin_delete_server", {
                _admin_key: rpcKey,
                _id: id,
              });
              if (!rpcErr) return json({ ok: true }, request);
            }
            return json({ error: error.message }, request, { status: 400 });
          }

          if (action === "zapi_status" || action === "zapi_qr" || action === "zapi_disconnect") {
            const cfg = await portalAdmin.getZapiConfigFromSettings();
            if (!cfg) {
              return json({ configured: false, connected: false, image: null }, request);
            }
            if (action === "zapi_status") {
              const res = await fetch(`${cfg.url}/status`, { headers: cfg.headers });
              const data = (await res.json().catch(() => ({}))) as {
                connected?: boolean;
                smartphoneConnected?: boolean;
              };
              return json(
                {
                  configured: true,
                  connected: Boolean(data.connected || data.smartphoneConnected),
                },
                request,
              );
            }
            if (action === "zapi_qr") {
              const res = await fetch(`${cfg.url}/qr-code/image`, { headers: cfg.headers });
              const data = (await res.json().catch(() => ({}))) as {
                connected?: boolean;
                value?: string;
              };
              return json(
                {
                  configured: true,
                  connected: Boolean(data.connected),
                  image: data.value ?? null,
                },
                request,
              );
            }
            const res = await fetch(`${cfg.url}/disconnect`, { headers: cfg.headers });
            return json({ ok: res.ok }, request);
          }

          if (action === "test_telegram") {
            const s = await portalAdmin.getAdminSettingsRow(ownerId);
            const botToken = String(s?.telegram_bot_token ?? "").trim();
            const chatId = String(s?.telegram_chat_id ?? "").trim();
            if (!botToken || !chatId) {
              return json({ error: "Preencha e salve o Bot Token e o Chat ID antes de testar." }, request, {
                status: 400,
              });
            }
            const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: chatId,
                text: "✅ Teste de notificação enviado pelo Painel ADM (Portal AJP VIP).",
              }),
            });
            const tg = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
            if (!res.ok || !tg.ok) {
              return json({ error: tg.description || "Falha ao enviar para o Telegram." }, request, {
                status: 400,
              });
            }
            return json({ ok: true }, request);
          }

          return json({ error: "Ação desconhecida." }, request, { status: 400 });
        } catch (e) {
          return json({ error: (e as Error).message || "Erro no servidor" }, request, { status: 500 });
        }
      },
    },
  },
});

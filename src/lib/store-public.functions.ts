import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CARD_FEE_PERCENT = 4.99;
const applyCardFee = (c: number) => Math.ceil(c / (1 - CARD_FEE_PERCENT / 100));

export type StorePublic = {
  owner_id: string;
  title: string;
  description: string | null;
  products: Array<{
    key: string;
    label: string;
    sale_cents: number;
    emoji: string | null;
    gradient: string | null;
    image_url: string | null;
  }>;
};

// Resolve loja pelo slug (anônimo)
export const getStorePublic = createServerFn({ method: "GET" })
  .inputValidator((data: { slug: string }) => data)
  .handler(async ({ data }): Promise<StorePublic | null> => {
    const { createClient } = await import("@supabase/supabase-js");
    const supa = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: owners } = await supa.rpc("find_store_owner_by_slug", { _slug: data.slug });
    const owner = (owners as Array<{ user_id: string; store_title: string | null; store_description: string | null }> | null)?.[0];
    if (!owner) return null;
    const { data: prods } = await supa.rpc("list_store_products", { _owner: owner.user_id });
    return {
      owner_id: owner.user_id,
      title: owner.store_title ?? "Loja",
      description: owner.store_description,
      products: ((prods as Array<{ key: string; label: string; sale_cents: number; emoji: string | null; gradient: string | null; image_url: string | null }>) ?? []).map((p) => ({
        key: p.key,
        label: p.label,
        sale_cents: p.sale_cents,
        emoji: p.emoji,
        gradient: p.gradient,
        image_url: p.image_url,
      })),
    };
  });

// Garante store_buyer + retorna minhas compras nessa loja
export const getMyStoreData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { slug: string; name?: string; phone?: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: owners } = await supabaseAdmin.rpc("find_store_owner_by_slug", { _slug: data.slug });
    const owner = (owners as Array<{ user_id: string }> | null)?.[0];
    if (!owner) return { ok: false as const, error: "Loja não encontrada" };

    // upsert buyer
    const email = (context.claims as { email?: string } | null)?.email ?? null;
    const { data: existing } = await supabaseAdmin
      .from("store_buyers")
      .select("*")
      .eq("user_id", owner.user_id)
      .eq("auth_user_id", context.userId)
      .maybeSingle();

    let buyer = existing as { id: string; name: string | null; phone: string | null; email: string | null } | null;
    if (!buyer) {
      const { data: ins } = await supabaseAdmin
        .from("store_buyers")
        .insert({
          user_id: owner.user_id,
          auth_user_id: context.userId,
          email,
          name: data.name ?? null,
          phone: data.phone ?? null,
        })
        .select("*")
        .single();
      buyer = ins as typeof buyer;
    } else if ((data.name && data.name !== buyer.name) || (data.phone && data.phone !== buyer.phone)) {
      const { data: upd } = await supabaseAdmin
        .from("store_buyers")
        .update({ name: data.name ?? buyer.name, phone: data.phone ?? buyer.phone })
        .eq("id", buyer.id)
        .select("*")
        .single();
      buyer = upd as typeof buyer;
    }

    const { data: requests } = await supabaseAdmin
      .from("renewal_requests")
      .select("id,label,amount_cents,status,mp_status,created_at,paid_at")
      .eq("buyer_id", buyer!.id)
      .order("created_at", { ascending: false })
      .limit(50);

    return {
      ok: true as const,
      owner_id: owner.user_id,
      buyer: buyer!,
      requests: requests ?? [],
    };
  });

// Cria pagamento (PIX ou Cartão) para comprador da loja
export const createStorePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { slug: string; product_key: string; method: "pix" | "card" }) => data)
  .handler(async ({ data, context, request }) => {
    if (data.method !== "pix" && data.method !== "card") {
      return { ok: false as const, error: "Método inválido" };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: owners } = await supabaseAdmin.rpc("find_store_owner_by_slug", { _slug: data.slug });
    const owner = (owners as Array<{ user_id: string }> | null)?.[0];
    if (!owner) return { ok: false as const, error: "Loja não encontrada" };

    const { data: buyer } = await supabaseAdmin
      .from("store_buyers")
      .select("id, name, phone, email")
      .eq("user_id", owner.user_id)
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    if (!buyer) return { ok: false as const, error: "Cadastro não encontrado" };

    const { data: product } = await supabaseAdmin
      .from("store_products")
      .select("label, sale_cents")
      .eq("user_id", owner.user_id)
      .eq("key", data.product_key)
      .eq("active", true)
      .maybeSingle();
    if (!product) return { ok: false as const, error: "Produto inválido" };

    const { data: ownerSettings } = await supabaseAdmin
      .from("settings")
      .select("mp_access_token")
      .eq("user_id", owner.user_id)
      .maybeSingle();
    const token = (ownerSettings as { mp_access_token?: string | null } | null)?.mp_access_token?.trim();
    if (!token) return { ok: false as const, error: "Mercado Pago não configurado pelo revendedor" };
    if (token.startsWith("TEST-")) return { ok: false as const, error: "Token de TESTE configurado pelo revendedor" };

    const base_cents = (product as { label: string; sale_cents: number }).sale_cents;
    const amount_cents = data.method === "card" ? applyCardFee(base_cents) : base_cents;
    const label = (product as { label: string; sale_cents: number }).label;

    const { data: renewal, error: insErr } = await supabaseAdmin
      .from("renewal_requests")
      .insert({
        user_id: owner.user_id,
        client_id: null,
        buyer_id: (buyer as { id: string }).id,
        days: 0,
        amount_cents,
        status: "awaiting_payment",
        label,
      })
      .select("id")
      .single();
    if (insErr || !renewal) return { ok: false as const, error: "Falha ao registrar pedido" };

    const url = new URL(request.url);
    const origin = `${url.protocol}//${url.host}`;
    const portalOrigin = request.headers.get("x-portal-origin") || origin;
    const buyerInfo = buyer as { name: string | null; email: string | null };
    const payerEmail = buyerInfo.email || `comprador.${(buyer as { id: string }).id.slice(0, 8)}@painelvip.app`;
    const description = `${label} - ${buyerInfo.name ?? "Comprador"}`;

    if (data.method === "pix") {
      const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Idempotency-Key": (renewal as { id: string }).id,
        },
        body: JSON.stringify({
          transaction_amount: Number((amount_cents / 100).toFixed(2)),
          description,
          payment_method_id: "pix",
          external_reference: (renewal as { id: string }).id,
          payer: {
            email: payerEmail,
            first_name: (buyerInfo.name ?? "Comprador").split(" ")[0],
            last_name: (buyerInfo.name ?? "VIP").split(" ").slice(1).join(" ") || "VIP",
          },
        }),
      });
      const mp = (await mpRes.json().catch(() => ({}))) as {
        id?: number | string;
        status?: string;
        message?: string;
        point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string } };
      };
      if (!mpRes.ok) {
        return { ok: false as const, error: `Falha no Mercado Pago: ${mp.message ?? mpRes.statusText}` };
      }
      const qr_code = mp.point_of_interaction?.transaction_data?.qr_code ?? "";
      const qr_code_base64 = mp.point_of_interaction?.transaction_data?.qr_code_base64 ?? "";
      const mp_payment_id = mp.id ? String(mp.id) : null;
      await supabaseAdmin
        .from("renewal_requests")
        .update({ mp_payment_id, mp_status: mp.status ?? "pending", pix_qr_code: qr_code, pix_qr_base64: qr_code_base64 })
        .eq("id", (renewal as { id: string }).id);
      return {
        ok: true as const,
        renewal_id: (renewal as { id: string }).id,
        payment_id: mp_payment_id,
        qr_code,
        qr_code_base64,
        amount_cents,
      };
    }

    // Cartão
    const back = `${portalOrigin}/loja/${data.slug}`;
    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Idempotency-Key": (renewal as { id: string }).id,
      },
      body: JSON.stringify({
        items: [{
          id: (renewal as { id: string }).id,
          title: description,
          quantity: 1,
          currency_id: "BRL",
          unit_price: Number((amount_cents / 100).toFixed(2)),
        }],
        payer: { name: buyerInfo.name ?? "Comprador", email: payerEmail },
        payment_methods: {
          excluded_payment_types: [{ id: "ticket" }, { id: "atm" }, { id: "bank_transfer" }],
          installments: 12,
        },
        external_reference: (renewal as { id: string }).id,
        notification_url: `${origin}/api/public/portal/mp-webhook?external_reference=${(renewal as { id: string }).id}`,
        back_urls: { success: back, pending: back, failure: back },
        auto_return: "approved",
        statement_descriptor: "LOJA",
      }),
    });
    const mp = (await mpRes.json().catch(() => ({}))) as { init_point?: string; message?: string };
    if (!mpRes.ok || !mp.init_point) {
      return { ok: false as const, error: `Falha no Mercado Pago: ${mp.message ?? mpRes.statusText}` };
    }
    await supabaseAdmin.from("renewal_requests").update({ mp_status: "pending" }).eq("id", (renewal as { id: string }).id);
    return { ok: true as const, renewal_id: (renewal as { id: string }).id, init_point: mp.init_point, amount_cents };
  });

// Verifica status de um pedido (polling)
export const getStoreOrderStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { renewal_id: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("renewal_requests")
      .select("id,status,mp_status,buyer_id")
      .eq("id", data.renewal_id)
      .maybeSingle();
    if (!row) return { ok: false as const };
    // confirma que o pedido pertence a um buyer do usuário atual
    const { data: buyer } = await supabaseAdmin
      .from("store_buyers")
      .select("id")
      .eq("auth_user_id", context.userId)
      .eq("id", (row as { buyer_id: string }).buyer_id)
      .maybeSingle();
    if (!buyer) return { ok: false as const };
    return { ok: true as const, status: (row as { status: string }).status, mp_status: (row as { mp_status: string | null }).mp_status };
  });

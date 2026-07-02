import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";

function gatewayHeaders(extra: Record<string, string> = {}) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const gmapsKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!lovableKey || !gmapsKey) throw new Error("Google Maps não conectado.");
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": gmapsKey,
    ...extra,
  };
}

// Geocodifica um endereço via gateway do Google Maps
export const geocodeAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { address: string }) => data)
  .handler(async ({ data }) => {
    const url = `${GATEWAY}/maps/api/geocode/json?address=${encodeURIComponent(data.address)}&region=br&language=pt-BR`;
    const res = await fetch(url, { headers: gatewayHeaders() });
    if (!res.ok) throw new Error(`Geocoding falhou (${res.status})`);
    const json = await res.json() as {
      status: string;
      results?: Array<{ geometry: { location: { lat: number; lng: number } }; formatted_address: string }>;
    };
    if (json.status !== "OK" || !json.results?.[0]) {
      throw new Error(`Endereço não encontrado (${json.status})`);
    }
    const r = json.results[0];
    return {
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
      formatted: r.formatted_address,
    };
  });

// Geocodifica todas as entregas pendentes sem coordenadas
export const geocodePendingDeliveries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: rows } = await supabase
      .from("deliveries")
      .select("id, address, neighborhood, city, zip")
      .eq("user_id", userId)
      .is("lat", null)
      .limit(50);
    let ok = 0;
    let fail = 0;
    for (const d of rows ?? []) {
      const parts = [d.address, d.neighborhood, d.city, d.zip, "Brasil"].filter(Boolean).join(", ");
      try {
        const url = `${GATEWAY}/maps/api/geocode/json?address=${encodeURIComponent(parts)}&region=br&language=pt-BR`;
        const res = await fetch(url, { headers: gatewayHeaders() });
        const json = await res.json() as { status: string; results?: Array<{ geometry: { location: { lat: number; lng: number } } }> };
        if (json.status === "OK" && json.results?.[0]) {
          const loc = json.results[0].geometry.location;
          await supabase
            .from("deliveries")
            .update({ lat: loc.lat, lng: loc.lng, geocoded_at: new Date().toISOString() })
            .eq("id", d.id);
          ok++;
        } else {
          fail++;
        }
      } catch {
        fail++;
      }
    }
    return { ok, fail };
  });

// Otimiza a ordem das entregas de uma rota via Routes API
export const optimizeRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { routeId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: route } = await supabase
      .from("delivery_routes")
      .select("id, origin_lat, origin_lng")
      .eq("id", data.routeId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!route) throw new Error("Rota não encontrada");

    const { data: stops } = await supabase
      .from("deliveries")
      .select("id, lat, lng, address")
      .eq("route_id", data.routeId)
      .eq("user_id", userId)
      .not("lat", "is", null)
      .not("lng", "is", null);
    const list = (stops ?? []) as Array<{ id: string; lat: number; lng: number; address: string }>;
    if (list.length < 2) throw new Error("Rota precisa ter pelo menos 2 paradas geocodificadas");

    const origin = route.origin_lat && route.origin_lng
      ? { location: { latLng: { latitude: route.origin_lat, longitude: route.origin_lng } } }
      : { location: { latLng: { latitude: list[0].lat, longitude: list[0].lng } } };

    const destination = { location: { latLng: { latitude: list[list.length - 1].lat, longitude: list[list.length - 1].lng } } };
    const intermediates = list.slice(0, -1).map((s) => ({
      location: { latLng: { latitude: s.lat, longitude: s.lng } },
    }));

    const body = {
      origin,
      destination,
      intermediates,
      travelMode: "DRIVE",
      optimizeWaypointOrder: true,
      routingPreference: "TRAFFIC_AWARE",
    };

    const res = await fetch(`${GATEWAY}/routes/directions/v2:computeRoutes`, {
      method: "POST",
      headers: gatewayHeaders({
        "Content-Type": "application/json",
        "X-Goog-FieldMask": "routes.optimizedIntermediateWaypointIndex,routes.distanceMeters,routes.duration",
      }),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Otimização falhou (${res.status})`);
    const json = await res.json() as {
      routes?: Array<{
        optimizedIntermediateWaypointIndex?: number[];
        distanceMeters?: number;
        duration?: string;
      }>;
    };
    const r = json.routes?.[0];
    if (!r) throw new Error("Sem rota retornada");

    // Reordena as paradas conforme optimizedIntermediateWaypointIndex + destino no final
    const orderedIds: string[] = [];
    for (const idx of r.optimizedIntermediateWaypointIndex ?? list.slice(0, -1).map((_, i) => i)) {
      orderedIds.push(list[idx].id);
    }
    orderedIds.push(list[list.length - 1].id);

    // Grava sequência
    for (let i = 0; i < orderedIds.length; i++) {
      await supabase.from("deliveries").update({ sequence: i + 1 }).eq("id", orderedIds[i]);
    }

    const durationSec = r.duration ? parseInt(String(r.duration).replace("s", ""), 10) : null;
    await supabase.from("delivery_routes").update({
      distance_meters: r.distanceMeters ?? null,
      duration_seconds: durationSec,
    }).eq("id", data.routeId);

    return {
      ok: true,
      distanceMeters: r.distanceMeters ?? 0,
      durationSeconds: durationSec ?? 0,
      count: orderedIds.length,
    };
  });

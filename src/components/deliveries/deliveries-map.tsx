/// <reference types="google.maps" />
import { useEffect, useRef } from "react";
import { loadGoogleMaps } from "@/lib/google-maps-loader";

export interface MapDelivery {
  id: string;
  lat: number | null;
  lng: number | null;
  customer_name: string;
  address: string;
  status: string;
}

const COLORS: Record<string, string> = {
  pending: "#3b82f6",     // azul
  in_route: "#eab308",    // amarelo
  delivered: "#22c55e",   // verde
  failed: "#ef4444",      // vermelho
};

export function DeliveriesMap({ deliveries, height = 420 }: { deliveries: MapDelivery[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then((g) => {
      if (cancelled || !ref.current) return;
      if (!mapRef.current) {
        mapRef.current = new g.maps.Map(ref.current, {
          center: { lat: -22.9068, lng: -43.1729 },
          zoom: 11,
          disableDefaultUI: false,
          streetViewControl: false,
          mapTypeControl: false,
        });
      }

      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];

      const bounds = new g.maps.LatLngBounds();
      let any = false;
      deliveries.forEach((d) => {
        if (d.lat == null || d.lng == null) return;
        const color = COLORS[d.status] ?? "#6b7280";
        const marker = new g.maps.Marker({
          position: { lat: d.lat, lng: d.lng },
          map: mapRef.current!,
          title: d.customer_name,
          icon: {
            path: g.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: color,
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 2,
          },
        });
        const iw = new g.maps.InfoWindow({
          content: `<div style="font-family:sans-serif;font-size:13px"><strong>${d.customer_name}</strong><br/>${d.address}</div>`,
        });
        marker.addListener("click", () => iw.open(mapRef.current!, marker));
        markersRef.current.push(marker);
        bounds.extend({ lat: d.lat, lng: d.lng });
        any = true;
      });
      if (any) mapRef.current.fitBounds(bounds, 60);
    }).catch((e) => console.error("[map]", e));
    return () => { cancelled = true; };
  }, [deliveries]);

  return <div ref={ref} style={{ width: "100%", height }} className="rounded-lg border border-border overflow-hidden" />;
}

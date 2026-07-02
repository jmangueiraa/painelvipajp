// Carrega a Google Maps JavaScript API sob demanda no cliente.
let promise: Promise<typeof google> | null = null;

export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if ((window as any).google?.maps) return Promise.resolve((window as any).google);
  if (promise) return promise;

  const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string | undefined;
  if (!key) return Promise.reject(new Error("Google Maps não configurado"));

  promise = new Promise((resolve, reject) => {
    const cb = "__gmapsCb_" + Date.now();
    (window as any)[cb] = () => resolve((window as any).google);
    const script = document.createElement("script");
    const params = new URLSearchParams({
      key,
      loading: "async",
      callback: cb,
      libraries: "marker",
    });
    if (channel) params.set("channel", channel);
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error("Falha ao carregar Google Maps"));
    document.head.appendChild(script);
  });
  return promise;
}

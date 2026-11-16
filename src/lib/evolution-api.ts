export type EvolutionConfig = { base_url: string; instance_name: string; api_key: string };
export function normalizeEvolutionInstance(value: string): string {
  const instance = value.trim();
  if (!/^[a-zA-Z0-9_ -]{1,100}$/.test(instance)) throw new Error("Informe um nome de instância com até 100 caracteres, usando letras, números, espaços, hífens ou sublinhados.");
  return instance;
}
export function normalizeEvolutionUrl(value: string): string {
  const url = new URL(value.trim());
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":") || /(^|\.)(localhost|local|internal|test|invalid)$/.test(host)) throw new Error("Informe uma URL HTTPS pública, sem credenciais ou parâmetros.");
  return url.toString().replace(/\/+$/, "");
}
export function evolutionRequest(config: EvolutionConfig, action: "status" | "qr" | "disconnect" | "send", message?: { phone: string; message: string }) {
  const paths = { status: "instance/connectionState", qr: "instance/connect", disconnect: "instance/logout", send: "message/sendText" };
  return { url: `${normalizeEvolutionUrl(config.base_url)}/${paths[action]}/${encodeURIComponent(config.instance_name)}`, init: {
    method: action === "disconnect" ? "DELETE" : action === "send" ? "POST" : "GET",
    redirect: "error" as const,
    headers: { "Content-Type": "application/json", apikey: config.api_key },
    ...(message ? { body: JSON.stringify({ number: message.phone, text: message.message }) } : {}),
  } };
}
export function evolutionConnected(body: { instance?: { state?: string } }): boolean { return body.instance?.state === "open"; }
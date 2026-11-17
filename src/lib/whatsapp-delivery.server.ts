import { getEvolutionConfig, callEvolution } from "./evolution-api.server";
import { sendZapiText } from "./zapi.server";

export async function sendWhatsAppText(args: { userId: string; phone: string; message: string }) {
  // Missing external schema keeps the legacy integration intact until activation.
  const config = await getEvolutionConfig(args.userId).catch(() => null);
  if (!config) return sendZapiText(args);
  await callEvolution(config, "send", { phone: args.phone, message: args.message });
  return { ok: true, status: 200 };
}
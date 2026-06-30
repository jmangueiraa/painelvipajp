import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const EventEnum = z.enum([
  "new_sale",
  "payment_approved",
  "renewal",
  "new_client",
  "trial",
  "payment_rejected",
]);

const PayloadSchema = z.object({
  event: EventEnum,
  payload: z
    .object({
      nome: z.string().nullish(),
      telefone: z.string().nullish(),
      email: z.string().nullish(),
      plano: z.string().nullish(),
      valor: z.string().nullish(),
      metodo: z.string().nullish(),
      data: z.string().nullish(),
      extra: z.string().nullish(),
    })
    .default({}),
});

export const notifyEventFn = createServerFn({ method: "POST" })
  .inputValidator((d) => PayloadSchema.parse(d))
  .handler(async ({ data }) => {
    const { notify } = await import("./notifications.server");
    return notify(data.event, data.payload ?? {});
  });

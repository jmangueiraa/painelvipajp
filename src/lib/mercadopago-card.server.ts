// Server-only: Utilitários para processamento transparente de cartão via API do Mercado Pago

export interface CardInput {
  card_number: string;
  cardholder_name: string;
  expiration_month: number;
  expiration_year: number;
  security_code: string;
  cpf: string;
  installments?: number;
}

export interface CardPaymentResult {
  ok: boolean;
  status: "approved" | "in_process" | "rejected" | "error";
  payment_id?: string | number;
  status_detail?: string;
  message?: string;
  date_approved?: string | null;
  transaction_amount?: number;
}

/**
 * Detecta a bandeira do cartão a partir dos primeiros dígitos
 */
export function detectCardBrand(cardNumber: string): string {
  const clean = (cardNumber || "").replace(/\D/g, "");
  if (!clean) return "visa";

  // Elo (Múltiplos BINs específicos do Brasil)
  if (
    /^(4011|4312|4389|4514|4576|5041|5066|5090|6277|6362|6363|5067|4573|6504|6505|6507|6509|6516|6550)/.test(
      clean,
    )
  ) {
    return "elo";
  }

  // Hipercard
  if (/^(606282|3841)/.test(clean)) {
    return "hipercard";
  }

  // American Express
  if (/^(34|37)/.test(clean)) {
    return "amex";
  }

  // Visa
  if (/^4/.test(clean)) {
    return "visa";
  }

  // Mastercard
  if (/^(5[1-5]|2[2-7])/.test(clean)) {
    return "master";
  }

  // Diners Club
  if (/^(30[0-5]|36|38)/.test(clean)) {
    return "diners";
  }

  // Discover
  if (/^(6011|65|64[4-9]|622)/.test(clean)) {
    return "discover";
  }

  return "visa";
}

/**
 * Traduz os códigos de status e recusa do Mercado Pago para mensagens humanizadas em português
 */
export function translateMpCardError(statusDetail?: string, genericMessage?: string): string {
  switch (statusDetail) {
    case "accredited":
      return "Pagamento aprovado com sucesso!";
    case "pending_contingency":
      return "O pagamento está sendo processado. Você receberá uma confirmação em instantes.";
    case "pending_review_manual":
      return "O pagamento está em análise manual pelo Mercado Pago. Aguarde alguns instantes.";
    case "cc_rejected_bad_filled_card_number":
      return "Número de cartão de crédito inválido. Verifique os dígitos informados.";
    case "cc_rejected_bad_filled_date":
      return "Data de validade incorreta ou cartão expirado.";
    case "cc_rejected_bad_filled_security_code":
      return "Código de segurança (CVV) inválido. Verifique o verso do seu cartão.";
    case "cc_rejected_bad_filled_other":
      return "Dados do cartão incorretos. Por favor, revise todos os campos preenchidos.";
    case "cc_rejected_call_for_authorize":
      return "Pagamento não autorizado. Por favor, entre em contato com seu banco emissor para autorizar a transação.";
    case "cc_rejected_card_disabled":
      return "Cartão desabilitado. Contate a operadora do cartão para ativá-lo ou use outro cartão.";
    case "cc_rejected_duplicated_payment":
      return "Transação duplicada recente. Verifique se o valor já não foi debitado em sua fatura.";
    case "cc_rejected_insufficient_amount":
      return "Saldo ou limite de crédito insuficiente para concluir a transação.";
    case "cc_rejected_max_attempts":
      return "Você atingiu o limite de tentativas permitidas. Tente novamente mais tarde ou use outro cartão / Pix.";
    case "cc_rejected_blacklist":
      return "Não foi possível processar o pagamento com este cartão. Escolha outra forma de pagamento.";
    case "cc_rejected_high_risk":
      return "Pagamento recusado pela análise preventiva de segurança. Recomendamos efetuar o pagamento via PIX.";
    default:
      if (genericMessage) return genericMessage;
      return "Pagamento não autorizado pela operadora do cartão. Tente outro cartão ou efetue via PIX.";
  }
}

/**
 * Cria token de cartão no Mercado Pago (POST /v1/card_tokens)
 */
export async function createMpCardToken(
  accessToken: string,
  cardData: CardInput,
): Promise<{ token?: string; error?: string }> {
  const cleanNumber = cardData.card_number.replace(/\D/g, "");
  const cleanCpf = cardData.cpf.replace(/\D/g, "");
  const cleanCvv = cardData.security_code.replace(/\D/g, "");

  if (cleanNumber.length < 13 || cleanNumber.length > 19) {
    return { error: "Número do cartão inválido (precisa ter entre 13 e 19 dígitos)." };
  }
  if (!cardData.cardholder_name || cardData.cardholder_name.trim().length < 3) {
    return { error: "Nome impresso no cartão é obrigatório." };
  }
  if (!cardData.expiration_month || cardData.expiration_month < 1 || cardData.expiration_month > 12) {
    return { error: "Mês de validade inválido (01 a 12)." };
  }
  const currentYear = new Date().getFullYear();
  let fullYear = Number(cardData.expiration_year);
  if (fullYear < 100) fullYear += 2000;
  if (fullYear < currentYear) {
    return { error: "Cartão vencido. Informe uma data de validade futura." };
  }
  if (cleanCvv.length < 3 || cleanCvv.length > 4) {
    return { error: "Código de segurança (CVV) inválido." };
  }
  if (cleanCpf.length !== 11) {
    return { error: "CPF do titular inválido (deve conter 11 dígitos)." };
  }

  const payload = {
    card_number: cleanNumber,
    security_code: cleanCvv,
    expiration_month: Number(cardData.expiration_month),
    expiration_year: fullYear,
    cardholder: {
      name: cardData.cardholder_name.trim().toUpperCase(),
      identification: {
        type: "CPF",
        number: cleanCpf,
      },
    },
  };

  try {
    const res = await fetch("https://api.mercadopago.com/v1/card_tokens", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      cause?: Array<{ code?: string | number; description?: string }>;
    };

    if (!res.ok || !data.id) {
      console.error("[createMpCardToken] Falha ao tokenizar cartão:", res.status, data);
      const causeMsg = data.cause?.map((c) => c.description).filter(Boolean).join("; ");
      const msg = causeMsg || data.message || "Falha ao validar os dados do cartão de crédito.";
      return { error: translateMpCardError(undefined, msg) };
    }

    return { token: data.id };
  } catch (err) {
    console.error("[createMpCardToken] Exceção de rede:", err);
    return { error: "Falha de conexão com os servidores do Mercado Pago." };
  }
}

/**
 * Cria cobrança direta com token de cartão no Mercado Pago (POST /v1/payments)
 */
export async function createMpDirectCardPayment(
  accessToken: string,
  params: {
    cardToken: string;
    amountCents: number;
    description: string;
    externalReference: string;
    installments: number;
    paymentMethodId: string;
    payer: {
      email: string;
      cpf: string;
      firstName: string;
      lastName: string;
    };
    notificationUrl?: string;
  },
): Promise<CardPaymentResult> {
  const transactionAmount = Number((params.amountCents / 100).toFixed(2));
  const cleanCpf = params.payer.cpf.replace(/\D/g, "");

  const body = {
    transaction_amount: transactionAmount,
    token: params.cardToken,
    description: params.description,
    installments: Math.max(1, Math.min(12, Number(params.installments) || 1)),
    payment_method_id: params.paymentMethodId,
    external_reference: params.externalReference,
    statement_descriptor: "PAINELVIP",
    notification_url: params.notificationUrl,
    payer: {
      email: params.payer.email,
      identification: {
        type: "CPF",
        number: cleanCpf,
      },
      first_name: params.payer.firstName || "Cliente",
      last_name: params.payer.lastName || "VIP",
    },
  };

  try {
    const res = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "X-Idempotency-Key": `${params.externalReference}_${Date.now()}`,
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json().catch(() => ({}))) as {
      id?: number | string;
      status?: "approved" | "in_process" | "rejected" | "cancelled";
      status_detail?: string;
      date_approved?: string | null;
      transaction_amount?: number;
      message?: string;
      cause?: Array<{ code?: string | number; description?: string }>;
    };

    if (!res.ok) {
      console.error("[createMpDirectCardPayment] Resposta de erro do MP:", res.status, data);
      const causeMsg = data.cause?.map((c) => c.description).filter(Boolean).join("; ");
      const rawMsg = causeMsg || data.message || "Erro ao processar transação.";
      return {
        ok: false,
        status: "error",
        status_detail: data.status_detail,
        message: translateMpCardError(data.status_detail, rawMsg),
      };
    }

    const isApproved = data.status === "approved";
    const isInProcess = data.status === "in_process";

    return {
      ok: isApproved || isInProcess,
      status: isApproved ? "approved" : isInProcess ? "in_process" : "rejected",
      payment_id: data.id,
      status_detail: data.status_detail,
      date_approved: data.date_approved,
      transaction_amount: data.transaction_amount ?? transactionAmount,
      message: translateMpCardError(data.status_detail),
    };
  } catch (err) {
    console.error("[createMpDirectCardPayment] Exceção:", err);
    return {
      ok: false,
      status: "error",
      message: "Falha de comunicação ao processar o cartão com o Mercado Pago.",
    };
  }
}

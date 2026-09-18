import React, { useState, useMemo } from "react";
import {
  CreditCard,
  Lock,
  User,
  Calendar,
  ShieldCheck,
  Loader2,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brl } from "@/lib/format";

export interface CardFormData {
  card_number: string;
  cardholder_name: string;
  expiration_month: number;
  expiration_year: number;
  security_code: string;
  cpf: string;
  installments: number;
}

interface ModernCardCheckoutProps {
  amountCents: number;
  baseCents?: number;
  itemTitle?: string;
  onSubmit: (cardData: CardFormData) => Promise<{ ok: boolean; message?: string; error?: string; detail?: string }>;
  onSuccess?: () => void;
  onCancel?: () => void;
  accentColor?: string; // default "#FF5500" or custom
}

/**
 * Detecta a bandeira para exibição visual imediata no frontend
 */
export function getCardBrandInfo(cardNumber: string) {
  const clean = cardNumber.replace(/\D/g, "");

  // Elo
  if (
    /^(4011|4312|4389|4514|4576|5041|5066|5090|6277|6362|6363|5067|4573|6504|6505|6507|6509|6516|6550)/.test(
      clean,
    )
  ) {
    return { name: "Elo", code: "elo", gradient: "from-blue-600 via-yellow-500 to-red-600" };
  }

  // Hipercard
  if (/^(606282|3841)/.test(clean)) {
    return { name: "Hipercard", code: "hipercard", gradient: "from-red-600 to-red-800" };
  }

  // American Express
  if (/^(34|37)/.test(clean)) {
    return { name: "Amex", code: "amex", gradient: "from-sky-700 to-blue-900" };
  }

  // Visa
  if (/^4/.test(clean)) {
    return { name: "Visa", code: "visa", gradient: "from-blue-700 to-indigo-900" };
  }

  // Mastercard
  if (/^(5[1-5]|2[2-7])/.test(clean)) {
    return { name: "Mastercard", code: "master", gradient: "from-orange-600 via-red-600 to-amber-600" };
  }

  // Diners
  if (/^(30[0-5]|36|38)/.test(clean)) {
    return { name: "Diners", code: "diners", gradient: "from-slate-600 to-slate-800" };
  }

  // Discover
  if (/^(6011|65|64[4-9]|622)/.test(clean)) {
    return { name: "Discover", code: "discover", gradient: "from-orange-500 to-amber-600" };
  }

  return { name: "Cartão", code: "generic", gradient: "from-zinc-800 to-zinc-950" };
}

export function ModernCardCheckout({
  amountCents,
  baseCents,
  itemTitle,
  onSubmit,
  onSuccess,
  onCancel,
  accentColor = "#FF5500",
}: ModernCardCheckoutProps) {
  const [cardNumber, setCardNumber] = useState("");
  const [cardholderName, setCardholderName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [cpf, setCpf] = useState("");
  const [installments, setInstallments] = useState(1);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);

  const brandInfo = useMemo(() => getCardBrandInfo(cardNumber), [cardNumber]);

  // Máscara do cartão
  function handleCardNumberChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 16);
    const parts = raw.match(/[\s\S]{1,4}/g) || [];
    setCardNumber(parts.join(" "));
    setErrorMsg(null);
  }

  // Máscara de validade (MM/AA)
  function handleExpiryChange(e: React.ChangeEvent<HTMLInputElement>) {
    let raw = e.target.value.replace(/\D/g, "").slice(0, 4);
    if (raw.length >= 3) {
      raw = `${raw.slice(0, 2)}/${raw.slice(2)}`;
    }
    setExpiry(raw);
    setErrorMsg(null);
  }

  // Máscara CVV
  function handleCvvChange(e: React.ChangeEvent<HTMLInputElement>) {
    const maxLen = brandInfo.code === "amex" ? 4 : 3;
    const raw = e.target.value.replace(/\D/g, "").slice(0, maxLen);
    setCvv(raw);
    setErrorMsg(null);
  }

  // Máscara CPF
  function handleCpfChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 11);
    let formatted = raw;
    if (raw.length > 9) {
      formatted = `${raw.slice(0, 3)}.${raw.slice(3, 6)}.${raw.slice(6, 9)}-${raw.slice(9)}`;
    } else if (raw.length > 6) {
      formatted = `${raw.slice(0, 3)}.${raw.slice(3, 6)}.${raw.slice(6)}`;
    } else if (raw.length > 3) {
      formatted = `${raw.slice(0, 3)}.${raw.slice(3)}`;
    }
    setCpf(formatted);
    setErrorMsg(null);
  }

  // Opções de parcelas de 1x a 12x
  const installmentOptions = useMemo(() => {
    const total = amountCents;
    const opts = [];
    for (let i = 1; i <= 12; i++) {
      const part = Math.round(total / i);
      opts.push({
        num: i,
        cents: part,
        label: i === 1 ? `1x de ${brl(total)} (à vista)` : `${i}x de ${brl(part)}`,
      });
    }
    return opts;
  }, [amountCents]);

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    const cleanNum = cardNumber.replace(/\D/g, "");
    const cleanCpf = cpf.replace(/\D/g, "");
    const cleanCvv = cvv.replace(/\D/g, "");

    if (cleanNum.length < 13 || cleanNum.length > 16) {
      setErrorMsg("Digite um número de cartão válido com 16 dígitos.");
      return;
    }
    if (!cardholderName.trim() || cardholderName.trim().length < 3) {
      setErrorMsg("Digite o nome completo do titular como impresso no cartão.");
      return;
    }
    if (!expiry.includes("/")) {
      setErrorMsg("Validade inválida. Utilize o formato MM/AA.");
      return;
    }
    const [mStr, yStr] = expiry.split("/");
    const month = Number(mStr);
    let year = Number(yStr);
    if (!month || month < 1 || month > 12) {
      setErrorMsg("Mês de validade inválido (01 a 12).");
      return;
    }
    if (year < 100) year += 2000;
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    if (year < currentYear || (year === currentYear && month < currentMonth)) {
      setErrorMsg("Cartão expirado. Por favor, utilize um cartão válido.");
      return;
    }
    if (cleanCvv.length < 3) {
      setErrorMsg("Código CVV inválido (3 ou 4 dígitos).");
      return;
    }
    if (cleanCpf.length !== 11) {
      setErrorMsg("CPF do titular inválido (deve conter 11 dígitos).");
      return;
    }

    setLoading(true);

    try {
      const res = await onSubmit({
        card_number: cleanNum,
        cardholder_name: cardholderName.trim().toUpperCase(),
        expiration_month: month,
        expiration_year: year,
        security_code: cleanCvv,
        cpf: cleanCpf,
        installments: Number(installments),
      });

      if (res.ok) {
        setIsSuccess(true);
        if (onSuccess) onSuccess();
      } else {
        setErrorMsg(res.message || res.error || "Pagamento recusado. Verifique os dados do cartão.");
      }
    } catch (err) {
      setErrorMsg((err as Error).message || "Falha ao processar pagamento com o Mercado Pago.");
    } finally {
      setLoading(false);
    }
  }

  // Se já concluiu com sucesso
  if (isSuccess) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center bg-white rounded-2xl p-6 shadow-sm animate-in zoom-in-95 duration-300">
        <div className="grid h-20 w-20 place-items-center rounded-full bg-emerald-500/15">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" strokeWidth={2.5} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-emerald-600">Pagamento aprovado!</h2>
          <p className="mt-1 text-xs text-slate-500">
            Sua transação foi aprovada com sucesso e os créditos foram liberados.
          </p>
        </div>
        {onCancel && (
          <Button
            style={{ backgroundColor: accentColor }}
            className="w-full text-white font-bold rounded-xl py-3 cursor-pointer hover:opacity-95"
            onClick={onCancel}
          >
            Fechar
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* ========================================================================= */}
      {/* CARTÃO VIRTUAL INTERATIVO (DARK LUXURY METALLIC)                          */}
      {/* ========================================================================= */}
      <div className="relative w-full aspect-[1.586/1] max-w-[340px] mx-auto rounded-2xl p-5 sm:p-6 text-white shadow-xl shadow-black/20 overflow-hidden bg-gradient-to-br from-zinc-900 via-zinc-800 to-black border border-white/10 select-none">
        {/* Efeito sutil de brilho metálico */}
        <div className="absolute -right-12 -top-12 w-44 h-44 rounded-full bg-white/5 blur-2xl pointer-events-none" />
        <div className="absolute -left-12 -bottom-12 w-44 h-44 rounded-full bg-white/5 blur-2xl pointer-events-none" />

        {/* Linhas de circuito sutis */}
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:12px_12px] opacity-40 pointer-events-none" />

        <div className="relative h-full flex flex-col justify-between z-10">
          {/* Topo do cartão: Chip & Bandeira */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Chip Metálico Dourado */}
              <div className="w-10 h-7 rounded-md bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600 border border-amber-300/60 shadow-inner flex items-center justify-center relative overflow-hidden">
                <div className="w-full h-[1px] bg-amber-800/40 absolute top-2.5" />
                <div className="w-full h-[1px] bg-amber-800/40 absolute bottom-2.5" />
                <div className="h-full w-[1px] bg-amber-800/40 absolute left-3" />
                <div className="h-full w-[1px] bg-amber-800/40 absolute right-3" />
              </div>

              {/* Ícone Contactless */}
              <svg className="w-4 h-4 text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8.5 16.5a5 5 0 0 1 0-9" />
                <path d="M12 19a8.5 8.5 0 0 0 0-14" />
                <path d="M15.5 21.5a12 12 0 0 0 0-19" />
              </svg>
            </div>

            {/* Badge Dinâmica da Bandeira */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15">
              {brandInfo.code === "visa" ? (
                <span className="text-xs font-black italic tracking-wider text-white">VISA</span>
              ) : brandInfo.code === "master" ? (
                <div className="flex items-center -space-x-1.5">
                  <div className="w-4 h-4 rounded-full bg-red-500 opacity-90" />
                  <div className="w-4 h-4 rounded-full bg-amber-400 opacity-90" />
                </div>
              ) : brandInfo.code === "elo" ? (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-black uppercase text-amber-300">elo</span>
                </div>
              ) : brandInfo.code === "hipercard" ? (
                <span className="text-[10px] font-black uppercase text-red-400">Hiper</span>
              ) : brandInfo.code === "amex" ? (
                <span className="text-[10px] font-bold text-sky-400">AMEX</span>
              ) : (
                <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Crédito</span>
              )}
            </div>
          </div>

          {/* Número do Cartão */}
          <div className="my-auto pt-2">
            <span className="font-mono text-base sm:text-lg tracking-widest text-zinc-100 drop-shadow font-semibold">
              {cardNumber.length > 0 ? (
                cardNumber
              ) : (
                <span className="text-zinc-500">•••• •••• •••• ••••</span>
              )}
            </span>
          </div>

          {/* Rodapé do Cartão: Titular e Validade */}
          <div className="flex items-end justify-between text-xs pt-1">
            <div className="max-w-[70%]">
              <span className="text-[9px] uppercase tracking-wider text-zinc-400 block font-medium">Titular</span>
              <span className="font-semibold tracking-wider text-zinc-100 uppercase truncate block text-xs">
                {cardholderName.length > 0 ? cardholderName : "NOME DO TITULAR"}
              </span>
            </div>

            <div className="text-right">
              <span className="text-[9px] uppercase tracking-wider text-zinc-400 block font-medium">Validade</span>
              <span className="font-mono font-semibold tracking-wider text-zinc-100 text-xs">
                {expiry.length > 0 ? expiry : "MM/AA"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* FORMULÁRIO DE CHECKOUT DIRETO                                             */}
      {/* ========================================================================= */}
      <form onSubmit={handlePay} className="space-y-3 bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-100">
        {/* Alerta de erro com tradução detalhada do Mercado Pago */}
        {errorMsg && (
          <div className="p-3 bg-red-50 border border-red-200/90 rounded-xl flex items-start gap-2.5 text-xs text-red-800 animate-in shake">
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 leading-snug">
              <span className="font-bold block">Não foi possível processar:</span>
              <span>{errorMsg}</span>
            </div>
          </div>
        )}

        {/* Campo 1: Número do Cartão */}
        <div className="space-y-1">
          <Label className="text-xs font-bold text-slate-700">Número do cartão</Label>
          <div className="relative">
            <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              inputMode="numeric"
              placeholder="0000 0000 0000 0000"
              value={cardNumber}
              onChange={handleCardNumberChange}
              disabled={loading}
              className="pl-9 pr-16 font-mono text-sm h-11 bg-slate-50/80 border-slate-200 focus:bg-white focus:border-orange-500 rounded-xl"
              required
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <span className="text-[10px] font-bold uppercase text-slate-400 bg-slate-200/80 px-1.5 py-0.5 rounded">
                {brandInfo.name}
              </span>
            </div>
          </div>
        </div>

        {/* Campo 2: Nome do Titular */}
        <div className="space-y-1">
          <Label className="text-xs font-bold text-slate-700">Nome impresso no cartão</Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder="Ex: JOÃO SILVA"
              value={cardholderName}
              onChange={(e) => {
                setCardholderName(e.target.value.toUpperCase());
                setErrorMsg(null);
              }}
              disabled={loading}
              className="pl-9 uppercase text-sm h-11 bg-slate-50/80 border-slate-200 focus:bg-white focus:border-orange-500 rounded-xl"
              required
            />
          </div>
        </div>

        {/* Campos 3 & 4: Validade e CVV */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="space-y-1">
            <Label className="text-xs font-bold text-slate-700">Validade</Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                type="text"
                inputMode="numeric"
                placeholder="MM/AA"
                value={expiry}
                onChange={handleExpiryChange}
                disabled={loading}
                className="pl-9 font-mono text-sm h-11 bg-slate-50/80 border-slate-200 focus:bg-white focus:border-orange-500 rounded-xl text-center"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-slate-700">CVV</Label>
              <span className="text-[10px] text-slate-400">Verso</span>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                type="password"
                inputMode="numeric"
                placeholder="123"
                value={cvv}
                onChange={handleCvvChange}
                disabled={loading}
                className="pl-9 font-mono text-sm h-11 bg-slate-50/80 border-slate-200 focus:bg-white focus:border-orange-500 rounded-xl text-center tracking-widest"
                required
              />
            </div>
          </div>
        </div>

        {/* Campo 5: CPF do Titular */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-bold text-slate-700">CPF do titular</Label>
            <span className="text-[10px] text-slate-400">Obrigatório p/ NF</span>
          </div>
          <div className="relative">
            <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={cpf}
              onChange={handleCpfChange}
              disabled={loading}
              className="pl-9 font-mono text-sm h-11 bg-slate-50/80 border-slate-200 focus:bg-white focus:border-orange-500 rounded-xl"
              required
            />
          </div>
        </div>

        {/* Campo 6: Parcelamento (1x a 12x) */}
        <div className="space-y-1">
          <Label className="text-xs font-bold text-slate-700">Parcelamento</Label>
          <select
            value={installments}
            onChange={(e) => setInstallments(Number(e.target.value))}
            disabled={loading}
            className="w-full h-11 px-3 text-xs sm:text-sm font-medium bg-slate-50/80 border border-slate-200 focus:bg-white focus:border-orange-500 rounded-xl outline-none transition text-slate-800"
          >
            {installmentOptions.map((opt) => (
              <option key={opt.num} value={opt.num}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Resumo & Selo de Segurança */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1 text-slate-400 text-[11px]">
            <Lock className="h-3.5 w-3.5 text-emerald-600" />
            <span>Mercado Pago 256-bit SSL</span>
          </div>
          <span className="font-extrabold text-slate-900 text-sm">
            Total: {brl(amountCents)}
          </span>
        </div>

        {/* Botão de Pagamento */}
        <Button
          type="submit"
          disabled={loading}
          style={{ backgroundColor: accentColor }}
          className="w-full text-white font-extrabold py-3.5 h-12 rounded-xl shadow-md shadow-orange-500/20 flex items-center justify-center gap-2 text-sm transition active:scale-[0.99] cursor-pointer hover:opacity-95"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-white" />
              <span>Processando no Mercado Pago...</span>
            </>
          ) : (
            <>
              <Lock className="h-4 w-4" />
              <span>Pagar {brl(amountCents)} agora</span>
            </>
          )}
        </Button>
      </form>
    </div>
  );
}

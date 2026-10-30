export interface Partner {
  id: string;
  user_id: string;
  auth_user_id: string | null;
  client_id: string | null;
  code: string;
  name: string;
  email: string;
  phone: string;
  pix_key: string | null;
  pix_key_type: "cpf" | "cnpj" | "email" | "telefone" | "aleatoria" | string | null;
  status: "ativo" | "inativo" | "bloqueado";
  balance_cents: number;
  total_earned_cents: number;
  total_withdrawn_cents: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PartnerCommission {
  id: string;
  partner_id: string;
  client_id: string;
  renewal_request_id: string | null;
  mp_payment_id: string | null;
  amount_cents: number;
  status: "pendente" | "aprovada" | "paga" | "cancelada";
  closing_id: string | null;
  notes: string | null;
  created_at: string;
  approved_at: string | null;
  paid_at: string | null;
  // Joined fields
  partner?: {
    name: string;
    code: string;
    pix_key: string | null;
    pix_key_type: string | null;
  };
  client?: {
    name: string;
    phone: string;
    due_date: string;
    status: string;
  };
}

export interface PartnerWeeklyClosing {
  id: string;
  partner_id: string;
  cycle_number: number | null;
  period_start: string;
  period_end: string;
  payment_due_date: string;
  commissions_count: number;
  total_cents: number;
  status: "aberto" | "fechado" | "pago" | "cancelado";
  pix_key: string | null;
  pix_key_type: string | null;
  pix_transaction_id: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  partner?: {
    name: string;
    code: string;
    email: string;
    phone: string;
  };
}

export interface PartnerWalletTransaction {
  id: string;
  partner_id: string;
  type: "comissao_creditada" | "saque_pix" | "ajuste" | "estorno";
  amount_cents: number;
  balance_after_cents: number;
  description: string;
  reference_id: string | null;
  created_at: string;
}

export interface PartnerClick {
  id: string;
  partner_id: string;
  ip: string | null;
  user_agent: string | null;
  referer: string | null;
  converted_to_client_id: string | null;
  created_at: string;
}

export interface PartnerSettings {
  id: string;
  user_id: string;
  commission_cents: number;
  is_enabled: boolean;
  auto_approve: boolean;
  terms_text: string | null;
  created_at: string;
  updated_at: string;
}

export interface IndicaOverviewStats {
  totalPartners: number;
  activePartners: number;
  totalReferredClients: number;
  activeReferredClients: number;
  mrrReferredCents: number;
  commissionsGeneratedCents: number;
  commissionsPendingCents: number;
  commissionsPaidCents: number;
}

// Traduz mensagens de erro comuns do Supabase/Auth para PT-BR.
const MAP: Array<[RegExp, string]> = [
  [/invalid login credentials/i, "E-mail ou senha incorretos"],
  [/email not confirmed/i, "E-mail ainda não confirmado"],
  [/user already registered/i, "Este e-mail já está cadastrado"],
  [/password should be at least (\d+) characters?/i, "A senha deve ter ao menos $1 caracteres"],
  [/email address .* is invalid/i, "E-mail inválido"],
  [/rate limit/i, "Muitas tentativas. Aguarde e tente novamente"],
  [/network|failed to fetch/i, "Falha de conexão. Verifique sua internet"],
  [/jwt|token/i, "Sessão expirada. Entre novamente"],
  [/row-level security|permission denied/i, "Você não tem permissão para esta ação"],
  [/duplicate key|already exists/i, "Registro já existe"],
  [/not found/i, "Registro não encontrado"],
  [/unauthorized/i, "Sessão expirada. Entre novamente"],
];

export function translateError(input: unknown): string {
  const msg = input instanceof Error ? input.message : String(input ?? "");
  if (!msg) return "Ocorreu um erro inesperado";
  for (const [re, pt] of MAP) {
    if (re.test(msg)) return msg.replace(re, pt);
  }
  return msg;
}

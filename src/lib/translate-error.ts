// Traduz mensagens de erro comuns do Supabase/Auth para PT-BR.
const MAP: Array<[RegExp, string]> = [
  [/password is known to be weak.*different one\.?/i, "Esta senha é considerada fraca e fácil de adivinhar. Escolha uma senha mais forte."],
  [/password.*(weak|pwned|leaked|compromised|breach)/i, "Esta senha é fraca ou já apareceu em vazamentos. Escolha outra."],
  [/new password should be different from the old password/i, "A nova senha deve ser diferente da senha atual"],
  [/same.*password/i, "A nova senha deve ser diferente da senha atual"],
  [/invalid login credentials/i, "E-mail ou senha incorretos"],
  [/email not confirmed/i, "E-mail ainda não confirmado"],
  [/user already registered/i, "Este e-mail já está cadastrado"],
  [/password should be at least (\d+) characters?/i, "A senha deve ter ao menos $1 caracteres"],
  [/password should contain/i, "A senha não atende aos requisitos mínimos"],
  [/email address .* is invalid/i, "E-mail inválido"],
  [/invalid email/i, "E-mail inválido"],
  [/rate limit|too many requests/i, "Muitas tentativas. Aguarde e tente novamente"],
  [/network|failed to fetch/i, "Falha de conexão. Verifique sua internet"],
  [/jwt|token/i, "Sessão expirada. Entre novamente"],
  [/row-level security|permission denied/i, "Você não tem permissão para esta ação"],
  [/duplicate key|already exists/i, "Registro já existe"],
  [/not found/i, "Registro não encontrado"],
  [/unauthorized/i, "Sessão expirada. Entre novamente"],
  [/user not found/i, "Usuário não encontrado"],
  [/auth session missing/i, "Sessão não encontrada. Entre novamente"],
];

export function translateError(input: unknown): string {
  const msg = input instanceof Error ? input.message : String(input ?? "");
  if (!msg) return "Ocorreu um erro inesperado";
  for (const [re, pt] of MAP) {
    if (re.test(msg)) return msg.replace(re, pt);
  }
  return msg;
}

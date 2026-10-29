const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "E-mail ou senha incorretos.",
  USER_ALREADY_EXISTS: "Já existe uma conta com este e-mail. Entre com ela.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Já existe uma conta com este e-mail. Entre com ela.",
  PASSWORD_TOO_SHORT: "A senha precisa de pelo menos 10 caracteres.",
  PASSWORD_TOO_LONG: "Senha longa demais.",
  INVALID_EMAIL: "E-mail inválido.",
  ORGANIZATION_ALREADY_EXISTS: "Já existe um escritório com este identificador. Tente outro nome.",
  YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
    "Você atingiu o limite de escritórios por conta.",
  INVITATION_NOT_FOUND: "Convite não encontrado ou já usado.",
  YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION: "Este convite foi enviado para outro e-mail.",
  USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: "Você já faz parte deste escritório.",
};

/** Turns a Better Auth client error into a pt-BR message. */
export function authErrorMessage(
  error: { code?: string | undefined; status?: number; message?: string | undefined } | null,
): string {
  if (!error) return "Algo deu errado. Tente de novo.";
  if (error.status === 429) return "Muitas tentativas. Aguarde um minuto e tente de novo.";
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code] as string;
  return "Não foi possível concluir. Confira os dados e tente de novo.";
}

/** "Pinheiro & Associados" → "pinheiro-associados-k3x9qa" (unique enough for a slug). */
export function officeSlug(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(4)), (byte) => byte.toString(36))
    .join("")
    .slice(0, 6);
  return `${base || "escritorio"}-${suffix}`;
}

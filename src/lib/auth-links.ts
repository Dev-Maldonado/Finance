export function authCallbackUrl(origin: string) {
  return new URL("/auth/callback", origin).toString();
}

export function authLinkError(search: string, hash: string) {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  const code = query.get("error_code") || fragment.get("error_code") || query.get("auth_error");
  if (code === "otp_expired")
    return "Este link expirou ou já foi utilizado. Solicite um novo email de confirmação ou recuperação de senha.";
  if (code || query.has("error") || fragment.has("error"))
    return "Não foi possível validar o link. Solicite um novo email e abra-o no mesmo navegador em que fez a solicitação.";
  return "";
}

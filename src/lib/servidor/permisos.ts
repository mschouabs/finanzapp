/** Cuentas que pueden usar Luca (la clave de Anthropic cuesta plata).
    Se configura en Vercel con LUCA_PERMITIDOS = "mail1@x.com,mail2@y.com".
    Sin esa variable, puede usarlo cualquier usuario con sesión. */
export function lucaPermitido(email: string | null | undefined): boolean {
  const lista = (process.env.LUCA_PERMITIDOS ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  if (!lista.length) return true
  return !!email && lista.includes(email.trim().toLowerCase())
}

/**
 * Normalises what a person types into a 2-step verification box: authenticator codes are six
 * digits; recovery codes are issued as `ABCD-EFGH` and matched exactly server-side, so spaces,
 * missing dashes and lowercase are forgiven here rather than failing as "incorrect code".
 */
export function normalizeMfaCode(raw: string): string {
  const compact = raw.replace(/[\s-]+/g, "").toUpperCase();
  if (/^\d{6}$/.test(compact)) return compact;
  if (/^[A-Z2-7]{8}$/.test(compact)) return `${compact.slice(0, 4)}-${compact.slice(4)}`;
  return raw.trim();
}

/** Exact or subdomain match against a registered institutional domain (docs/10 §2.2). */
export function emailDomainMatches(email: string, registeredDomain: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase().trim();
  if (!domain) return false;
  const registered = registeredDomain.toLowerCase();
  return domain === registered || domain.endsWith(`.${registered}`);
}

export function extractDomain(email: string): string | null {
  return email.split("@")[1]?.toLowerCase().trim() || null;
}

/**
 * Browsers built on ICU (Chromium, Safari) still report several zones by their legacy identifiers —
 * "Asia/Calcutta" rather than "Asia/Kolkata" — both from `Intl.supportedValuesOf("timeZone")` and
 * as the device's own zone. They are the same zones, but the names read as dated (and the list
 * would otherwise lack the ones our own data uses), so the UI always shows the current IANA name.
 */
const CURRENT_NAME: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Rangoon": "Asia/Yangon",
  "Europe/Kiev": "Europe/Kyiv",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "America/Godthab": "America/Nuuk",
  "Pacific/Enderbury": "Pacific/Kanton",
  "Pacific/Truk": "Pacific/Chuuk",
  "Pacific/Ponape": "Pacific/Pohnpei",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "America/Catamarca": "America/Argentina/Catamarca",
  "America/Cordoba": "America/Argentina/Cordoba",
  "America/Jujuy": "America/Argentina/Jujuy",
  "America/Mendoza": "America/Argentina/Mendoza",
  "America/Indianapolis": "America/Indiana/Indianapolis",
  "America/Louisville": "America/Kentucky/Louisville",
};

export function currentZoneName(zone: string): string {
  return CURRENT_NAME[zone] ?? zone;
}

/** Every zone the runtime knows, by current name, sorted, always including `mustInclude`. */
export function listTimeZones(mustInclude: string): string[] {
  const raw =
    typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  const zones = new Set(raw.map(currentZoneName));
  zones.add(mustInclude);
  return [...zones].sort((a, b) => a.localeCompare(b));
}

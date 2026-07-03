/**
 * Minimal ambient declaration for @rapideditor/country-coder, covering only
 * what this codebase uses. The real package ships its own types; this ambient
 * declaration simply takes precedence and matches the same signature, so it is
 * safe to keep (or delete once every dev environment has run `npm install`).
 */
declare module "@rapideditor/country-coder" {
  /**
   * Resolves a [longitude, latitude] location to an ISO 3166-1 alpha-2 code,
   * or null when the location matches no country (open sea, poles, …).
   */
  export function iso1A2Code(
    location: [number, number] | { lon: number; lat: number },
    options?: { level?: string },
  ): string | null;
}

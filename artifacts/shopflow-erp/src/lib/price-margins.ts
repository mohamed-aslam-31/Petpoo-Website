// ── Shared price-margin settings ──────────────────────────────────────────────
// Wholesale and retail profit % are stored in localStorage so they persist
// across sessions and apply globally to all product price auto-calculations.

const MARGINS_KEY = "shopflow-price-margins";

export interface PriceMargins {
  wholesale: number; // e.g. 25 → wholesale = purchase × 1.25
  retail: number;    // e.g. 50 → retail    = purchase × 1.50
}

const DEFAULTS: PriceMargins = { wholesale: 25, retail: 50 };

export function getMargins(): PriceMargins {
  try {
    const raw = localStorage.getItem(MARGINS_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<PriceMargins>;
    const wholesale = typeof parsed.wholesale === "number" && parsed.wholesale >= 0 ? parsed.wholesale : DEFAULTS.wholesale;
    const retail    = typeof parsed.retail    === "number" && parsed.retail    >= 0 ? parsed.retail    : DEFAULTS.retail;
    return { wholesale, retail };
  } catch {
    return DEFAULTS;
  }
}

export function saveMargins(margins: PriceMargins): void {
  try {
    localStorage.setItem(MARGINS_KEY, JSON.stringify(margins));
  } catch {}
}

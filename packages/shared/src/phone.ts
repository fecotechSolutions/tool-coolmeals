/**
 * Canonical Argentine WhatsApp / lead phones.
 *
 * Goal: `3513053755` and `543513053755` and `5493513053755` resolve to the same key
 * so Pipeline dups, recontact lock, and KPIs don't split one person into many cards.
 */

export function phoneDigits(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

/**
 * Store / compare format: country 54 + national number (no leading 0, no mobile "9"
 * after 54). Example: 543513053755.
 */
export function canonicalizeArPhone(value: string | null | undefined): string {
  let d = phoneDigits(value);
  if (!d) return "";

  while (d.startsWith("00")) d = d.slice(2);
  while (d.startsWith("0")) d = d.slice(1);

  // 549XXXXXXXXXX → drop the mobile "9" after country code
  if (d.startsWith("549") && d.length >= 12) {
    d = "54" + d.slice(3);
  }

  // National 10-digit (area+number) → prepend 54
  if (!d.startsWith("54") && (d.length === 10 || d.length === 8)) {
    d = "54" + d;
  }

  // 54 + leftover leading 0
  if (d.startsWith("540")) {
    d = "54" + d.slice(3).replace(/^0+/, "");
  }

  return d;
}

/** Variants to find an existing row before insert (exact match on any form). */
export function phoneLookupVariants(value: string | null | undefined): string[] {
  const raw = phoneDigits(value);
  const canon = canonicalizeArPhone(value);
  const set = new Set<string>();
  if (raw) set.add(raw);
  if (canon) {
    set.add(canon);
    if (canon.startsWith("54") && canon.length > 2) {
      const national = canon.slice(2);
      set.add(national);
      set.add("549" + national);
      set.add("54" + national);
    }
  }
  return Array.from(set).filter(Boolean);
}

/** Account numbers are 10 digits: 9 plus a Luhn check digit (same rule as the API and the network). */

export function luhnCheckDigit(base: string): string {
  let total = 0;
  [...base].reverse().forEach((ch, i) => {
    let d = Number(ch);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    total += d;
  });
  return String((10 - (total % 10)) % 10);
}

export function isValidAccountNumber(value: string): boolean {
  return /^\d{10}$/.test(value) && luhnCheckDigit(value.slice(0, 9)) === value[9];
}

/** Keeps digits only, at most 10. */
export function cleanAccountNumber(value: string): string {
  return value.replace(/\D/g, "").slice(0, 10);
}

/** "2000000022" → "200 000 0022", easier to read aloud and compare. */
export function formatAccountNumber(value: string | null | undefined): string {
  if (!value) return "";
  return value.length === 10 ? `${value.slice(0, 3)} ${value.slice(3, 6)} ${value.slice(6)}` : value;
}

export function maskAccountNumber(value: string | null | undefined): string {
  return value ? `••••${value.slice(-4)}` : "";
}

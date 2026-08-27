export function formatInr(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

export function rupeesToPaise(rupees: number) {
  return Math.round(rupees * 100);
}

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GST_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function isValidPan(value: string) {
  return !value || PAN_RE.test(value.toUpperCase());
}

export function isValidGstin(value: string) {
  return !value || GST_RE.test(value.toUpperCase());
}

export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length > 10) return digits.slice(-10);
  return digits;
}

export function fuzzyScore(a: string, b: string) {
  const x = a.trim().toLowerCase().replace(/\s+/g, " ");
  const y = b.trim().toLowerCase().replace(/\s+/g, " ");
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.85;
  const xs = new Set(x.split(" "));
  const ys = y.split(" ");
  const hit = ys.filter((w) => xs.has(w)).length;
  return hit / Math.max(ys.length, 1);
}

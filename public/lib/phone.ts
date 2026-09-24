// Nigerian local numbers (0803…) become international (234803…) — shared by
// the WhatsApp receipt link (POS.tsx) and phone verification (Register.tsx).
export function toIntlPhone(raw: string): string {
  let digits = (raw || "").replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 11) digits = "234" + digits.slice(1);
  return digits;
}

export function fmtMoney(n: number, currency = "₦") {
  const sign = n < 0 ? "−" : "";
  return `${sign}${currency}${Math.abs(n).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
}

export function fmtTime(d: string | Date) {
  return new Date(d).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" });
}

export function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtDateTime(d: string | Date) {
  return `${fmtDate(d)} · ${fmtTime(d)}`;
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

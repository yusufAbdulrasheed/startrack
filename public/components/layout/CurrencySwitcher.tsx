import { useEffect } from "react";
import { ArrowDown, ArrowUp, Coins } from "lucide-react";
import { CURRENCIES, currencyCodeOf, findCurrency } from "#shared/currencies.js";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Field";
import { pairRate, refreshRates, setDisplayCurrency, useRates } from "@/lib/rates";
import { useSession } from "@/lib/session";

/**
 * Settings card: view every amount in another currency at the live exchange
 * rate. Nothing stored changes — only what's shown — and receipts and invoices
 * keep the business's own currency. While a currency is chosen the rate is
 * re-fetched every minute and the figures (and the ▲/▼ here) follow it.
 */
export function DisplayCurrencyCard() {
  const { activeBusiness } = useSession();
  const rs = useRates();

  // Load the rates when the card appears so the list can show them.
  useEffect(() => { if (!rs.rates) refreshRates(); }, [rs.rates]);

  if (!activeBusiness) return null;
  const baseCode = currencyCodeOf(activeBusiness.settings);
  if (!findCurrency(baseCode)) return null;
  const display = rs.display && rs.display !== baseCode ? rs.display : "";
  const { now, before } = display ? pairRate(baseCode, display) : { now: null, before: null };
  const dir = now && before && now !== before ? (now > before ? "up" : "down") : null;
  const rateOf = (code: string) => (rs.rates && rs.rates[baseCode] && rs.rates[code] ? rs.rates[code] / rs.rates[baseCode] : null);

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-1">
        <Coins className="w-4 h-4 text-primary" />
        <div className="text-[13px] font-semibold text-t1">View amounts in another currency</div>
      </div>
      <div className="text-[12px] text-t3 mb-3">
        Shows every price and total converted at the live exchange rate, and updates as the rate moves. Only what you see changes —
        your records, receipts and invoices stay in {baseCode}.
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <Select
          className="sm:!w-80"
          aria-label="Display currency"
          value={display}
          onChange={(e) => setDisplayCurrency(e.target.value || null)}
        >
          <option value="">My currency ({baseCode})</option>
          {CURRENCIES.filter((c) => c.code !== baseCode).map((c) => {
            const r = rateOf(c.code);
            return (
              <option key={c.code} value={c.code}>
                {c.symbol}  {c.name} ({c.code}){r ? ` — 1 ${baseCode} = ${r.toLocaleString("en", { maximumSignificantDigits: 5 })}` : ""}
              </option>
            );
          })}
        </Select>
        {display && now && (
          <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-t2">
            1 {baseCode} = <span className="font-mono">{now.toLocaleString("en", { maximumSignificantDigits: 6 })}</span> {display}
            {dir === "up" && <ArrowUp className="w-3.5 h-3.5 text-success" aria-label="Rate rose" />}
            {dir === "down" && <ArrowDown className="w-3.5 h-3.5 text-danger" aria-label="Rate fell" />}
          </span>
        )}
      </div>
      <div className="text-[11.5px] text-t4 mt-2.5">
        {rs.error && !rs.rates ? "Rates are unavailable right now." : rs.updatedAt ? `Rates refreshed ${new Date(rs.updatedAt).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}.` : "Loading rates…"}
        {" "}Your choice is remembered on this device.
      </div>
    </Card>
  );
}

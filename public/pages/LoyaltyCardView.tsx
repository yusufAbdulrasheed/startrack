import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { qrDataUrl } from "@/lib/qrcode";

type CardInfo = { code: string; firstName: string; businessName: string };

/**
 * The page a customer lands on from a shared WhatsApp link or an emailed
 * QR — public, no login. Deliberately shows nothing but a first name, the
 * business name and the QR itself (re-rendered client-side from the code —
 * see loyaltyCardPublic.routes.js's own minimal payload).
 */
export function LoyaltyCardView() {
  const { code = "" } = useParams();
  const [card, setCard] = useState<CardInfo | null>(null);
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<CardInfo>(`/public/loyalty-cards/${code}`)
      .then(async (c) => {
        setCard(c);
        setQr(await qrDataUrl(`${window.location.origin}/loyalty/${c.code}`, 260));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "This loyalty card isn't valid."));
  }, [code]);

  return (
    <div className="min-h-full flex items-center justify-center bg-canvas px-5 py-10">
      <div className="w-full max-w-sm rounded-card border border-line bg-surface shadow-e2 p-6 text-center">
        {error ? (
          <p className="text-[13px] text-danger font-medium">{error}</p>
        ) : !card ? (
          <div className="w-8 h-8 mx-auto rounded-full border-2 border-line border-t-primary animate-spin" />
        ) : (
          <>
            <div className="w-10 h-10 mx-auto rounded-full bg-primary-soft text-primary flex items-center justify-center mb-3">
              <Sparkles className="w-5 h-5" />
            </div>
            <h1 className="font-display text-[18px] font-extrabold text-t1">Hi {card.firstName} 👋</h1>
            <p className="text-[13px] text-t3 mt-1">Your loyalty card for {card.businessName}</p>
            {qr && <img src={qr} width={260} height={260} alt="Your loyalty QR code" className="mx-auto mt-5 rounded-ctl border border-line" />}
            <p className="text-[11px] text-t4 mt-4">Show this at the till on your next visit to get your discount.</p>
          </>
        )}
      </div>
    </div>
  );
}

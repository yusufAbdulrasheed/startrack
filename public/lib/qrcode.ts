import QRCode from "qrcode";

// Client-side QR rendering — same library as the server (server/modules/loyalty/
// loyaltyCard.service.js), so a card looks identical whether it arrives by
// email or is shown live in the app. No round trip needed: given just the
// code/url, the browser draws it instantly.
export async function qrDataUrl(text: string, size = 220): Promise<string> {
  return QRCode.toDataURL(text, { margin: 1, width: size });
}

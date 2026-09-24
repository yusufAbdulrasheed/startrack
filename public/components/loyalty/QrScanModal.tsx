import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input, ErrorBanner } from "@/components/ui/Field";
import { Keyboard } from "lucide-react";

// A scanned QR can carry either a bare code or a full card URL
// (…/loyalty/<code> — see loyaltyCard.service.js's loyaltyCardUrl). Either
// way, the code is what the server actually needs.
function extractCode(scanned: string): string {
  const m = scanned.match(/\/loyalty\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : scanned.trim();
}

/**
 * Camera-driven QR capture with a manual-entry fallback — reused verbatim
 * for gym check-in later, not just loyalty scans at POS. Hand-rolled rather
 * than an all-in-one widget, same call as barcodes.ts/outbox.ts: StarTrack
 * owns the permission states and the fallback, not a third-party component.
 */
export function QrScanModal({ open, onClose, onCode, title = "Scan loyalty card" }: {
  open: boolean;
  onClose: () => void;
  onCode: (code: string) => void;
  title?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const [manual, setManual] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || manual) return;
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        tick();
      } catch {
        if (!cancelled) setError("Camera unavailable — enter the code by hand instead.");
      }
    }

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(frame.data, frame.width, frame.height);
      if (result?.data) {
        onCode(extractCode(result.data));
        return; // stop the loop — cleanup effect below tears the stream down
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open, manual, onCode]);

  useEffect(() => {
    if (!open) { setManual(false); setManualCode(""); setError(""); }
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={manual ? "Type the code from the card" : "Point the camera at the QR code"}>
      <div className="space-y-3">
        <ErrorBanner message={error} />
        {!manual ? (
          <>
            <div className="relative aspect-square w-full max-w-[320px] mx-auto rounded-ctl overflow-hidden bg-black">
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
              <canvas ref={canvasRef} className="hidden" />
              <div className="absolute inset-6 border-2 border-white/70 rounded-lg pointer-events-none" />
            </div>
            <button
              type="button"
              onClick={() => setManual(true)}
              className="w-full flex items-center justify-center gap-1.5 text-[12px] font-semibold text-primary hover:underline"
            >
              <Keyboard className="w-3.5 h-3.5" /> Enter the code manually
            </button>
          </>
        ) : (
          <form
            onSubmit={(e) => { e.preventDefault(); if (manualCode.trim()) onCode(extractCode(manualCode.trim())); }}
            className="space-y-3"
          >
            <Field label="Loyalty code">
              <Input autoFocus value={manualCode} onChange={(e) => setManualCode(e.target.value)} placeholder="From the customer's card" />
            </Field>
            <Button type="submit" className="w-full" disabled={!manualCode.trim()}>Apply</Button>
            <button type="button" onClick={() => setManual(false)} className="w-full text-[12px] font-semibold text-primary hover:underline">
              Use the camera instead
            </button>
          </form>
        )}
      </div>
    </Modal>
  );
}

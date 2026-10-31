import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Store } from "lucide-react";
import { SiteView } from "@/components/site/SiteView";
import { StorefrontApp } from "@/components/storefront/StorefrontApp";
import type { Gate } from "@/lib/shop";
import { api, ApiError } from "@/lib/api";
import type { SiteData } from "@/lib/site";

/** A business's public page — no login, read-only, whatever the owner published. */
export function BusinessSite() {
  const { slug = "" } = useParams();
  const [data, setData] = useState<SiteData | Gate | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setData(null);
    setError("");
    // ?src=qr (the printed code) rides along so the owner can see their poster is working.
    const src = new URLSearchParams(window.location.search).get("src") === "qr" ? "?src=qr" : "";
    api<SiteData | Gate>(`/public/sites/${encodeURIComponent(slug)}${src}`)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e instanceof ApiError && e.status === 404 ? "This page isn't available." : "Couldn't load this page. Please try again."));
    return () => { live = false; };
  }, [slug]);

  useEffect(() => {
    if (!data || "storefront" in data) return; // a store sets its own title
    const before = document.title;
    document.title = data.headline ? `${data.name} — ${data.headline}` : data.name;
    return () => { document.title = before; };
  }, [data]);

  if (error) {
    return (
      <div className="min-h-full grid place-items-center bg-canvas px-5 py-16 text-center">
        <div>
          <span className="mx-auto grid place-items-center w-14 h-14 rounded-2xl bg-primary-soft text-primary"><Store className="w-6 h-6" /></span>
          <h1 className="mt-4 text-[20px] font-bold text-t1">{error}</h1>
          <p className="mt-1.5 text-[13.5px] text-t3">Check the link, or ask the business to share it again.</p>
        </div>
      </div>
    );
  }
  if (!data) {
    return <div className="min-h-full grid place-items-center bg-canvas"><div className="w-8 h-8 rounded-full border-2 border-line border-t-primary animate-spin" /></div>;
  }
  if ((data as Gate).storefront) return <StorefrontApp slug={slug} gate={data as Gate} />;
  return <SiteView data={data as SiteData} />;
}

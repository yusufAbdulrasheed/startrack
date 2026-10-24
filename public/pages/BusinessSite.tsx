import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Store } from "lucide-react";
import { SiteView } from "@/components/site/SiteView";
import { api, ApiError } from "@/lib/api";
import type { SiteData } from "@/lib/site";

/** A business's public page — no login, read-only, whatever the owner published. */
export function BusinessSite() {
  const { slug = "" } = useParams();
  const [data, setData] = useState<SiteData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setData(null);
    setError("");
    api<SiteData>(`/public/sites/${encodeURIComponent(slug)}`)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e instanceof ApiError && e.status === 404 ? "This page isn't available." : "Couldn't load this page. Please try again."));
    return () => { live = false; };
  }, [slug]);

  useEffect(() => {
    if (!data) return;
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
  return <SiteView data={data} />;
}

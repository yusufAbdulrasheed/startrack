// Same-origin by default: in production the API serves this very page, and in
// development Vite proxies /api to it. VITE_API_URL is only needed if the
// client is ever deployed apart from the server again.
const BASE = (import.meta.env.VITE_API_URL as string) || "/api";
const TOKEN_KEY = "startrack.token";

let token: string | null = localStorage.getItem(TOKEN_KEY);
let businessId: string | null = null;
let branchId: string | null = null;

export function setToken(t: string | null) {
  token = t;
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}
export function getToken() {
  return token;
}

// The active business/branch ride on every request as headers. The server
// validates them against the caller's membership — they're context, not authority.
export function setTenant(biz: string | null, branch: string | null) {
  businessId = biz;
  branchId = branch;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  /** The server's whole error body, e.g. which plan a refused feature needs. */
  data?: Record<string, any>;
  constructor(message: string, status: number, code?: string, data?: Record<string, any>) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  let res: Response;
  // A FormData body (file uploads) must NOT get an explicit Content-Type —
  // fetch sets multipart/form-data with the right boundary itself, and a
  // fixed "application/json" header here would break every image upload.
  const isForm = typeof FormData !== "undefined" && opts.body instanceof FormData;
  try {
    res = await fetch(BASE + path, {
      ...opts,
      headers: {
        ...(isForm ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(businessId ? { "x-business-id": businessId } : {}),
        ...(branchId ? { "x-branch-id": branchId } : {}),
        ...(opts.headers || {}),
      },
    });
  } catch {
    throw new ApiError("Can't reach the server. Is the API running?", 0, "network");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // A plan boundary isn't a failure to hide in a corner: tell the whole app so
    // it can offer the upgrade, whichever screen made the request.
    if (res.status === 403 && (data.error === "plan_required" || data.error === "plan_limit")) {
      window.dispatchEvent(new CustomEvent("st:plan", { detail: data }));
    }
    if (res.status === 402 && data.error === "subscription_lapsed") {
      window.dispatchEvent(new CustomEvent("st:plan", { detail: { ...data, lapsed: true } }));
    }
    throw new ApiError(data.message || data.error || "Something went wrong", res.status, data.error, data);
  }
  return data as T;
}

/**
 * Fetches a file (a PDF or spreadsheet report) with the same auth and tenant
 * headers as every other call, then hands it to the browser as a download. A
 * plain <a href> can't be used: the token travels in a header, not a cookie.
 */
export async function apiDownload(path: string, fallbackName = "download"): Promise<void> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(businessId ? { "x-business-id": businessId } : {}),
        ...(branchId ? { "x-branch-id": branchId } : {}),
      },
    });
  } catch {
    throw new ApiError("Can't reach the server. Is the API running?", 0, "network");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.message || data.error || "Couldn't download that file.", res.status, data.error);
  }
  const disposition = res.headers.get("content-disposition") || "";
  const name = /filename="?([^";]+)"?/i.exec(disposition)?.[1] || fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

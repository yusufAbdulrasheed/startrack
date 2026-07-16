import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

/**
 * Tiny fetch-on-mount hook: data, loading, error, and a reload() for after
 * mutations. Re-fetches when the path changes (e.g. branch switch bumps a key).
 */
export function useApi<T = any>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState<string>("");
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!path) return;
    const mySeq = ++seq.current;
    setLoading(true);
    setError("");
    try {
      const result = await api<T>(path);
      if (mySeq === seq.current) setData(result);
    } catch (err: any) {
      if (mySeq === seq.current) setError(err.message || "Failed to load");
    } finally {
      if (mySeq === seq.current) setLoading(false);
    }
  }, [path, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}

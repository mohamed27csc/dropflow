"use client";

import { useCallback, useEffect, useState } from "react";

/** Appel JSON avec message d'erreur lisible. */
export async function api<T = unknown>(url: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> {
  const res = await fetch(url, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `Erreur ${res.status}`);
  return json as T;
}

/** Charge une URL au montage si `enabled`. `reload()` relance l'appel. */
export function useApi<T>(url: string, enabled: boolean) {
  const [s, setS] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: enabled });

  const run = useCallback(() => {
    api<T>(url).then(
      (data) => setS({ data, error: null, loading: false }),
      (e: Error) => setS({ data: null, error: e.message, loading: false }),
    );
  }, [url]);

  useEffect(() => {
    if (enabled) run();
  }, [enabled, run]);

  const reload = useCallback(() => {
    setS((cur) => ({ ...cur, loading: true }));
    run();
  }, [run]);

  return { ...s, reload };
}

"use client";

import { useState, useEffect } from "react";

const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK_AUTH === "true";

export function useApiData<T>(
  fetcher: () => Promise<T>,
  mockData: T,
): { data: T; loading: boolean; error: string | null; reload: () => void } {
  const [data, setData] = useState<T>(mockData);
  const [loading, setLoading] = useState(!MOCK_MODE);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (MOCK_MODE) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetcher()
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  return { data, loading, error, reload: () => setTick((t) => t + 1) };
}

export { MOCK_MODE };

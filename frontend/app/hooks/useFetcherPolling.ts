import { useEffect, useRef } from 'react';
import { useFetcher } from 'react-router';

type FetcherLike<T> = ReturnType<typeof useFetcher<T>>;

export function useFetcherPolling<T>(args: {
  key: string;
  url: string;
  intervalMs: number;
  enabled?: boolean;
}): FetcherLike<T> {
  const { key, url, intervalMs, enabled = true } = args;
  const fetcher = useFetcher<T>({ key });
  const urlRef = useRef(url);

  useEffect(() => {
    urlRef.current = url;
  }, [url]);

  useEffect(() => {
    if (!enabled) return;

    fetcher.load(url);

    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetcher.load(urlRef.current);
      }
    }, intervalMs);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetcher.load(urlRef.current);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, url, intervalMs, enabled]);

  return fetcher;
}

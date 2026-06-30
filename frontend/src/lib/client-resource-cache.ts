"use client";

type CacheEntry<T> = {
  value?: T;
  expiresAt: number;
  promise?: Promise<T>;
};

const resourceCache = new Map<string, CacheEntry<unknown>>();

export async function readCachedClientResource<T>(
  key: string,
  loader: () => Promise<T>,
  options?: {
    ttlMs?: number;
    force?: boolean;
  },
) {
  if (typeof window === "undefined") {
    return loader();
  }

  const ttlMs = options?.ttlMs ?? 30_000;
  const now = Date.now();
  const existing = resourceCache.get(key) as CacheEntry<T> | undefined;

  if (!options?.force && existing) {
    if (existing.value !== undefined && existing.expiresAt > now) {
      return existing.value;
    }

    if (existing.promise) {
      return existing.promise;
    }
  }

  const promise = loader()
    .then((value) => {
      resourceCache.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
      });
      return value;
    })
    .catch((error) => {
      const current = resourceCache.get(key) as CacheEntry<T> | undefined;

      if (current?.value !== undefined && current.expiresAt > Date.now()) {
        resourceCache.set(key, current);
      } else {
        resourceCache.delete(key);
      }

      throw error;
    });

  resourceCache.set(key, {
    value: existing?.value,
    expiresAt: existing?.expiresAt ?? 0,
    promise,
  });

  return promise;
}

export function primeCachedClientResource<T>(key: string, value: T, ttlMs = 30_000) {
  if (typeof window === "undefined") {
    return;
  }

  resourceCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

export function clearCachedClientResource(key: string) {
  resourceCache.delete(key);
}

export function clearAllCachedClientResources() {
  resourceCache.clear();
}

"use client";

import { useSyncExternalStore } from "react";

type StorageArea = "local" | "session";
const STORAGE_EVENT = "spacewise-storage-change";
const hydrationListeners = new Set<() => void>();
let hydrated = false;

function subscribeHydration(callback: () => void) {
  hydrationListeners.add(callback);
  if (!hydrated) {
    hydrated = true;
    queueMicrotask(() => hydrationListeners.forEach(listener => listener()));
  }
  return () => hydrationListeners.delete(callback);
}

function readStorage(key: string, area: StorageArea): string | null {
  if (typeof window === "undefined") return null;
  try {
    return (area === "local" ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

function subscribe(key: string, area: StorageArea, callback: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === key && (area === "local" ? event.storageArea === window.localStorage : event.storageArea === window.sessionStorage)) callback();
  };
  const onSameTabChange = (event: Event) => {
    const detail = (event as CustomEvent<{ key: string; area: StorageArea }>).detail;
    if (detail?.key === key && detail.area === area) callback();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(STORAGE_EVENT, onSameTabChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(STORAGE_EVENT, onSameTabChange);
  };
}

export function useBrowserStorageValue(key: string, area: StorageArea = "local") {
  return useSyncExternalStore(
    callback => subscribe(key, area, callback),
    () => readStorage(key, area),
    () => null,
  );
}

export function useHasHydrated() {
  return useSyncExternalStore(subscribeHydration, () => hydrated, () => false);
}

export function notifyStorageChange(key: string, area: StorageArea = "local") {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(STORAGE_EVENT, { detail: { key, area } }));
  }
}

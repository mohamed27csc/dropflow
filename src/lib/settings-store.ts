"use client";

import { useSyncExternalStore } from "react";
import { LIVE } from "./mode";
import { DEFAULT_SETTINGS, type Settings, type Usage } from "./settings";

export { DEFAULT_SETTINGS };
export type { CountryCode, Settings } from "./settings";

/**
 * Réglages côté navigateur.
 * - Mode démo : persistés dans localStorage.
 * - Mode live : chargés depuis /api/settings (Supabase) et enregistrés au fil de l'eau.
 *   Plan, quotas et connexions restent gérés par le serveur ; aucune clé n'est stockée ici.
 */

export type ServerInfo = { missing: string[]; ai: boolean } | null;

const LIVE_DEFAULTS: Settings = {
  ...DEFAULT_SETTINGS,
  pseudo: "",
  email: "",
  ebay: { fr: { connected: false, shop: "" }, de: { connected: false, shop: "" }, uk: { connected: false, shop: "" } },
  cj: { connected: false, keyHint: "" },
  printful: { connected: false, keyHint: "" },
  vinted: { connected: false, keyHint: "" },
};
const INITIAL = LIVE ? LIVE_DEFAULTS : DEFAULT_SETTINGS;

const KEY = "dropflow-demo-settings-v1";

let state: Settings = INITIAL;
let serverInfo: ServerInfo = null;
let loaded = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

async function fetchFromServer(retry = true) {
  try {
    const res = await fetch("/api/settings", { cache: "no-store" });
    if (!res.ok) {
      // Session pas encore prête (juste après une connexion) : un seul nouvel essai plutôt que d'afficher le plan Free par défaut.
      if (retry) setTimeout(() => void fetchFromServer(false), 1500);
      return;
    }
    const json = (await res.json()) as { settings: Settings; server: NonNullable<ServerInfo> };
    state = json.settings;
    serverInfo = json.server;
    notify();
  } catch {
    /* hors ligne : on garde l'état courant */
  }
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  if (LIVE) {
    void fetchFromServer();
    // Revenir sur l'app (iPhone : sortie de veille, autre onglet) recharge les réglages.
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && void fetchFromServer(false));
    return;
  }
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) state = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* stockage indisponible (navigation privée…) */
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function persist() {
  if (LIVE) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const { pricing, sync, autoOrder, fx, pseudo } = state;
      void fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pricing, sync, autoOrder, fx, ...(pseudo.trim().length >= 2 ? { pseudo } : {}) }) });
    }, 600);
    return;
  }
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* idem */
  }
}

export function updateSettings(patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)) {
  load();
  state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  persist();
  notify();
}

/** Quotas du jour renvoyés par le serveur après une action (mode live). */
export function setUsage(usage: Usage) {
  state = { ...state, usage };
  notify();
}

/** Recharge tout depuis le serveur (après une connexion eBay/CJ, par exemple). */
export function refreshSettings() {
  if (LIVE) return fetchFromServer();
}

export function resetSettings() {
  state = INITIAL;
  persist();
  notify();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getSnapshot = () => {
  load();
  return state;
};
const getServerSnapshot = () => INITIAL;

export function useSettings() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useServerInfo() {
  return useSyncExternalStore(subscribe, () => serverInfo, () => null);
}

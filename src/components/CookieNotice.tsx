"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

const KEY = "dropflow-cookie-notice-v1";
const listeners = new Set<() => void>();
const read = () => {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * Information cookies. L'app n'utilise QUE des cookies strictement nécessaires (session de connexion) : ils sont exemptés
 * de consentement (CNIL/ePrivacy) ; aucun traceur publicitaire ni mesure d'audience. Le bandeau informe, il ne demande pas de choix.
 */
export function CookieNotice() {
  const seen = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => true, // rendu serveur : caché, évite un clignotement à l'hydratation
  );
  if (seen) return null;
  return (
    <div role="region" aria-label="Information sur les cookies" className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-md rounded-2xl bg-ink p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-sm text-white shadow-2xl">
      <p>
        Cookies strictement nécessaires uniquement (connexion). Aucun traceur publicitaire ni mesure d&apos;audience.{" "}
        <Link href="/confidentialite" className="font-semibold underline">
          En savoir plus
        </Link>
      </p>
      <button
        className="mt-3 h-11 w-full rounded-xl bg-brand-400 font-bold text-ink"
        onClick={() => {
          try {
            window.localStorage.setItem(KEY, "1");
          } catch {
            /* stockage bloqué : le bandeau réapparaîtra, sans gravité */
          }
          listeners.forEach((l) => l());
        }}
      >
        Compris
      </button>
    </div>
  );
}

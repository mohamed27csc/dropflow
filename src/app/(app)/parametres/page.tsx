import type { Metadata } from "next";
import { SettingsView } from "./settings-view";

export const metadata: Metadata = { title: "Paramètres" };

export default async function Page({ searchParams }: PageProps<"/parametres">) {
  const { ebay, msg, market } = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const flash = one(ebay) === "ok" ? { ok: true, text: `eBay ${(one(market) ?? "").toUpperCase()} connecté.` } : one(ebay) === "error" ? { ok: false, text: one(msg) ?? "Connexion eBay échouée." } : null;
  return <SettingsView flash={flash} />;
}

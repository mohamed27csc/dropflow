"use client";

import Link from "next/link";
import { useState } from "react";
import { BarChart3, Ban, CalendarDays, Globe2, MapPin, Search, Zap } from "lucide-react";
import { Button, Card, Input, SectionLabel, Select, UsageBar, useFakeAction, useToast } from "@/components/ui";
import { int, money, pct } from "@/lib/format";
import { MARKETPLACES } from "@/lib/demo-data";
import { PLANS } from "@/lib/plans";
import { seeded } from "@/lib/seeded";
import { LIVE } from "@/lib/mode";
import { setUsage, updateSettings, useSettings } from "@/lib/settings-store";
import { api } from "@/lib/use-api";

type Analysis = {
  keyword: string;
  /** null en mode live : l'API publique eBay ne donne pas les volumes de ventes. */
  sold: number | null;
  total?: number;
  avgPrice: number;
  sellers: number;
  sellThrough: number | null;
  items: { title: string; price: number; sold: number | null }[];
  words: string[];
};

const PERIODS = [
  { value: "7", label: "7 jours" },
  { value: "30", label: "30 jours" },
  { value: "90", label: "90 jours" },
];
const LOCATIONS = [
  { value: "fr", label: "France" },
  { value: "de", label: "Allemagne" },
  { value: "uk", label: "Royaume-Uni" },
  { value: "eu", label: "Europe" },
];
const MODIFIERS = ["pro", "premium", "portable", "rechargeable", "sans fil", "lot de 2", "2024", "étanche"];

/** Analyse factice mais stable : mêmes filtres → mêmes chiffres. */
function fakeAnalysis(keyword: string, period: string, exclude: string): Analysis {
  const rnd = seeded(`${keyword}|${period}`);
  const excluded = exclude.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);
  const scale = Number(period) / 30;
  const base = keyword.trim();
  const words = MODIFIERS.filter((m) => !excluded.includes(m)).sort(() => rnd() - 0.5).slice(0, 6);
  const items = Array.from({ length: 6 }, (_, i) => {
    const mod = words[i % words.length] ?? "";
    return { title: `${base} ${mod}`.replace(/\s+/g, " ").trim(), price: Math.round((6 + rnd() * 40) * 100) / 100, sold: Math.round((40 + rnd() * 900) * scale) };
  }).sort((a, b) => b.sold - a.sold);
  const sold = items.reduce((s, i) => s + i.sold, 0) * Math.round(3 + rnd() * 6);
  return { keyword: base, sold, avgPrice: items.reduce((s, i) => s + i.price, 0) / items.length, sellers: Math.round(10 + rnd() * 140), sellThrough: 12 + rnd() * 50, items, words };
}

export function AnalyticsView() {
  const { plan, usage } = useSettings();
  const max = PLANS[plan].quotas.analyses;
  const reached = usage.analyses >= max;

  const [keyword, setKeyword] = useState("");
  const [market, setMarket] = useState("fr");
  const [period, setPeriod] = useState("30");
  const [location, setLocation] = useState("fr");
  const [exclude, setExclude] = useState("");
  const [result, setResult] = useState<Analysis | null>(null);
  const [fakeBusy, run] = useFakeAction(1100);
  const [liveBusy, setLiveBusy] = useState(false);
  const toast = useToast();
  const busy = fakeBusy || liveBusy;

  const canRun = keyword.trim().length >= 2 && !reached && !busy;

  async function analyseLive() {
    setLiveBusy(true);
    try {
      const r = await api<{ total: number; avgPrice: number; sellers: number; items: { title: string; price: number }[]; words: string[]; usage: Parameters<typeof setUsage>[0] }>("/api/analytics", { keyword, market, exclude });
      setUsage(r.usage);
      setResult({ keyword: keyword.trim(), sold: null, total: r.total, avgPrice: r.avgPrice, sellers: r.sellers, sellThrough: null, items: r.items.map((i) => ({ ...i, sold: null })), words: r.words });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erreur d'analyse", "warn");
    } finally {
      setLiveBusy(false);
    }
  }

  function analyse() {
    if (!canRun) return;
    if (LIVE) return void analyseLive();
    run(() => {
      setResult(fakeAnalysis(keyword, period, exclude));
      updateSettings((s) => ({ usage: { ...s.usage, analyses: s.usage.analyses + 1 } }));
    });
  }

  return (
    <>
      <header className="mb-6 text-center">
        <div className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl bg-brand-50">
          <BarChart3 className="size-8 text-brand-500" aria-hidden />
        </div>
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">Analytics</h1>
        <p className="mt-1 text-lg text-muted">Analysez les ventes eBay pour trouver les meilleurs mots-clés</p>
      </header>

      <Card className="p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            type="search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Rechercher un mot-clé…"
            className="h-14 border-0 pl-12 shadow-none focus:ring-0"
            aria-label="Mot-clé à analyser"
            onKeyDown={(e) => e.key === "Enter" && analyse()}
          />
        </div>
        {reached ? (
          <Button full variant="warning" href="/profil#plans" icon={<Zap className="size-5" />} className="mt-2">
            Quota atteint ({usage.analyses}/{max}) — Premium
          </Button>
        ) : (
          <Button full className="mt-2" disabled={!canRun && !busy} loading={busy} icon={<Search className="size-5" />} onClick={analyse}>
            Analyser ({max - usage.analyses} restante{max - usage.analyses > 1 ? "s" : ""})
          </Button>
        )}
      </Card>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <FilterCard icon={<Globe2 className="size-5 text-brand-500" />} label="Marketplace">
          <Select value={market} onChange={setMarket} options={MARKETPLACES} aria-label="Marketplace" className="pl-3! pr-8!" />
        </FilterCard>
        <FilterCard icon={<CalendarDays className="size-5 text-brand-500" />} label="Période">
          <Select value={period} onChange={setPeriod} options={PERIODS} aria-label="Période" className="pl-3! pr-8!" />
        </FilterCard>
        <FilterCard icon={<MapPin className="size-5 text-brand-500" />} label="Localisation">
          <Select value={location} onChange={setLocation} options={LOCATIONS} aria-label="Localisation du vendeur" className="pl-3! pr-8!" />
        </FilterCard>
        <FilterCard icon={<Ban className="size-5 text-danger" />} label="Exclure" tint="bg-red-50">
          <Input value={exclude} onChange={(e) => setExclude(e.target.value)} placeholder="coque, verre" aria-label="Mots à exclure" />
        </FilterCard>
      </div>

      <p className="mt-3 text-center text-sm text-muted">
        Plan {PLANS[plan].name} : {max} analyses par jour.{" "}
        {plan === "free" && (
          <Link href="/profil#plans" className="font-semibold text-brand-600 underline">
            Voir Pro
          </Link>
        )}
      </p>

      {result ? (
        <section className="mt-6 space-y-4" aria-label={`Résultats pour ${result.keyword}`}>
          <h2 className="text-xl font-extrabold">Résultats : « {result.keyword} »</h2>
          <div className="grid grid-cols-2 gap-3">
            {(result.sold === null
              ? [
                  ["Annonces actives", int(result.total ?? 0)],
                  ["Prix moyen", money(result.avgPrice)],
                  ["Vendeurs (échantillon)", int(result.sellers)],
                ]
              : [
                  ["Ventes", int(result.sold)],
                  ["Prix moyen", money(result.avgPrice)],
                  ["Vendeurs", int(result.sellers)],
                  ["Taux de vente", pct(result.sellThrough ?? 0, 0)],
                ]
            ).map(([label, value]) => (
              <Card key={label} className="p-4">
                <p className="text-sm text-muted">{label}</p>
                <p className="mt-1 text-2xl font-extrabold tabular-nums">{value}</p>
              </Card>
            ))}
          </div>

          <Card className="p-5">
            <SectionLabel>{result.sold === null ? "Annonces les mieux placées" : "Annonces les plus vendues"}</SectionLabel>
            <ul className="mt-3 divide-y divide-gray-100">
              {result.items.map((it, i) => (
                <li key={it.title} className="flex items-center gap-3 py-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gray-100 text-sm font-bold text-muted">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{it.title}</span>
                  <span className="text-right text-sm tabular-nums">
                    {it.sold !== null && <span className="block font-bold">{int(it.sold)} ventes</span>}
                    <span className={it.sold === null ? "font-bold" : "text-muted"}>{money(it.price)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <SectionLabel>Mots-clés fréquents</SectionLabel>
            <div className="mt-3 flex flex-wrap gap-2">
              {result.words.map((w) => (
                <span key={w} className="rounded-full bg-brand-50 px-3.5 py-1.5 text-[15px] font-semibold text-brand-700">
                  {w}
                </span>
              ))}
            </div>
            <Button variant="secondary" full className="mt-4" href={`/title-builder?product=${encodeURIComponent(result.keyword)}&keywords=${encodeURIComponent(result.words.slice(0, 4).join(", "))}`}>
              Utiliser dans le Title Builder
            </Button>
          </Card>
          <p className="text-center text-xs text-muted">
            {LIVE ? "Annonces actuellement en ligne (API Browse d'eBay). Les volumes de ventes ne sont pas fournis par l'API publique." : "Données de démonstration."}
          </p>
        </section>
      ) : (
        <section className="mx-auto mt-14 max-w-md text-center">
          <h2 className="text-[34px] font-extrabold uppercase leading-[1.1] tracking-tight">
            Analysez les ventes réelles, <span className="text-brand-400">construisez votre titre.</span>
          </h2>
          <p className="mt-5 text-lg text-muted">Notre système analyse les articles vendus sur eBay, identifie les mots-clés qui convertissent et vous aide à bâtir un titre optimisé.</p>
        </section>
      )}

      <Card className="mt-8 p-5">
        <UsageBar label="Analyses aujourd'hui" used={usage.analyses} max={max} />
      </Card>
    </>
  );
}

function FilterCard({ icon, label, tint = "bg-brand-50", children }: { icon: React.ReactNode; label: string; tint?: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <span className={`grid size-9 place-items-center rounded-xl ${tint}`}>{icon}</span>
        <span className="font-semibold">{label}</span>
      </div>
      {children}
    </Card>
  );
}

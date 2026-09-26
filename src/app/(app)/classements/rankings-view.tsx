"use client";

import { useState } from "react";
import { AlertTriangle, Rocket, Send } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Badge, Button, Card, Notice, PageHeader, ProductThumb, Segmented, Select, useToast } from "@/components/ui";
import { MARKETPLACES, RANKINGS } from "@/lib/demo-data";
import { int, money } from "@/lib/format";
import { cn } from "@/lib/cn";
import { LIVE } from "@/lib/mode";
import { api, useApi } from "@/lib/use-api";

const PERIODS = { "7": 0.28, "30": 1, "90": 2.7 } as const;
type Period = keyof typeof PERIODS;

function DemoRankings() {
  const [period, setPeriod] = useState<Period>("30");
  const [market, setMarket] = useState("fr");
  const factor = PERIODS[period] * (market === "fr" ? 1 : market === "de" ? 1.35 : 0.8);

  return (
    <>
      <PageHeader title="Classements" subtitle="Les mots-clés qui se vendent le plus" action={<Badge tone="new">New</Badge>} />

      <Segmented
        value={period}
        onChange={setPeriod}
        options={[
          { value: "7", label: "7 jours" },
          { value: "30", label: "30 jours" },
          { value: "90", label: "90 jours" },
        ]}
      />
      <div className="mt-3">
        <Select value={market} onChange={setMarket} options={MARKETPLACES} aria-label="Marketplace" />
      </div>

      <ol className="mt-5 space-y-3">
        {RANKINGS.map((r, i) => (
          <li key={r.keyword}>
            <Card className={cn("flex items-center gap-4 p-4", i === 0 && "border-brand-200 bg-brand-50/60")}>
              <span
                className={cn(
                  "grid size-11 shrink-0 place-items-center rounded-2xl text-lg font-extrabold",
                  i === 0 ? "bg-brand-400 text-white" : i < 3 ? "bg-brand-100 text-brand-700" : "bg-gray-100 text-muted",
                )}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-bold capitalize">{r.keyword}</p>
                <p className="text-sm text-muted tabular-nums">
                  {int(Math.round(r.sales * factor))} ventes · {money(r.avgPrice)} moy. · {r.sellers} vendeurs
                </p>
              </div>
              <span className={cn("inline-flex shrink-0 items-center gap-1 text-sm font-bold tabular-nums", r.trendPct >= 0 ? "text-[#15803d]" : "text-warn")}>
                {r.trendPct >= 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
                {Math.abs(r.trendPct)} %
              </span>
            </Card>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-center text-xs text-muted">Données de démonstration.</p>
    </>
  );
}

type RankItem = { cjId: string; title: string; image?: string; cjCost: number; listedNum: number; growthPct?: number; sinceDays?: number; estPrice: number; estProfit: number };

type Tier = "all" | "low" | "mid" | "high";
/** Bornes en prix eBay ESTIMÉ (hors livraison) : le prix final peut être plus haut une fois le port ajouté à la publication. */
const TIERS: Record<Tier, { label: string; test: (p: number) => boolean }> = {
  all: { label: "Tous", test: () => true },
  low: { label: "0-30 €", test: (p) => p < 30 },
  mid: { label: "30-50 €", test: (p) => p >= 30 && p < 50 },
  high: { label: "50 € +", test: (p) => p >= 50 },
};

/** Vrais produits CJ : tendances relevées, sinon populaires triés par gain. Un bouton publie l'annonce sur eBay. */
function LiveRankings() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi<{ source: "rising" | "popular"; days: number; items: RankItem[] }>("/api/rankings", true);
  const [market, setMarket] = useState("fr");
  const [tier, setTier] = useState<Tier>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});

  const items = data?.items ?? [];
  const filtered = items.filter((p) => TIERS[tier].test(p.estPrice));
  const counts = Object.fromEntries((Object.keys(TIERS) as Tier[]).map((k) => [k, k === "all" ? items.length : items.filter((p) => TIERS[k].test(p.estPrice)).length])) as Record<Tier, number>;

  async function publish(p: RankItem) {
    setBusy(p.cjId);
    try {
      const r = await api<{ listing: { price: number; title: string } }>("/api/listings/add", { link: p.cjId, market });
      setDone((d) => ({ ...d, [p.cjId]: r.listing.title }));
      toast(`Publié à ${money(r.listing.price)}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Publication impossible", "warn");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader title="Classements" subtitle={data?.source === "rising" ? "Produits dont le nombre de boutiques CJ grimpe" : "Produits populaires mais pas saturés, classés par gain"} action={<Badge tone="new">New</Badge>} />
      <Select value={market} onChange={setMarket} options={MARKETPLACES} aria-label="Publier sur" />

      <div className="mt-3">
        <Segmented
          value={tier}
          onChange={setTier}
          options={(Object.keys(TIERS) as Tier[]).map((k) => ({ value: k, label: `${TIERS[k].label} (${counts[k]})` }))}
        />
      </div>

      <div className="mt-3">
        <Notice icon={<Rocket className="size-5" />}>
          {data?.source === "rising" ? `Tendances calculées sur ${data.days} jours de relevés.` : "Pas encore assez de relevés pour repérer les tendances (2 jours minimum) : produits populaires filtrés."} Le prix eBay est une estimation <strong>hors livraison</strong> : le prix final peut dépasser la tranche affichée une fois le port ajouté. Publiez peu d&apos;exemplaires au début.
        </Notice>
      </div>
      {error && (
        <div className="mt-3">
          <Notice icon={<AlertTriangle className="size-5" />}>{error}</Notice>
        </div>
      )}
      {loading && !data && <p className="mt-6 text-center text-muted">Chargement des produits CJ…</p>}
      {data && filtered.length === 0 && <p className="mt-6 text-center text-muted">Aucun produit dans cette tranche de prix pour l&apos;instant.</p>}
      <ol className="mt-5 space-y-3">
        {filtered.map((p, i) => (
          <li key={p.cjId}>
            <Card className="p-4">
              <div className="flex gap-4">
                <ProductThumb image={p.image} size={72} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-muted">#{i + 1}</p>
                  <h3 className="line-clamp-2 text-[16px] font-bold leading-snug">{p.title}</h3>
                  <p className="mt-1 text-sm text-muted tabular-nums">
                    {p.growthPct ? `🚀 +${p.growthPct} % de boutiques en ${p.sinceDays} j` : `${int(p.listedNum)} boutiques`} · coût {money(p.cjCost)}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
                <p className="text-sm tabular-nums">
                  eBay ≈ <span className="font-extrabold text-brand-600">{money(p.estPrice)}</span> · gain ≈ <span className="font-bold">{money(p.estProfit)}</span>
                </p>
                {done[p.cjId] ? (
                  <Badge tone="ok">Publié</Badge>
                ) : (
                  <Button size="sm" loading={busy === p.cjId} disabled={busy !== null} icon={<Send className="size-4" />} onClick={() => publish(p)}>
                    Publier
                  </Button>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ol>
      <Button variant="secondary" full className="mt-4" onClick={reload} loading={loading}>
        Actualiser
      </Button>
    </>
  );
}

export function RankingsView() {
  return LIVE ? <LiveRankings /> : <DemoRankings />;
}

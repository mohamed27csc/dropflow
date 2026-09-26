"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, Flame, PackageX, RefreshCw, ShieldAlert, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Badge, Button, Card, Notice, ProductThumb, SectionLabel, Segmented, useFakeAction, useToast } from "@/components/ui";
import { CJ_TRENDS, COUNTRIES, DASHBOARD, LISTINGS, type DayStats, type Listing } from "@/lib/demo-data";
import { int, money, pct } from "@/lib/format";
import { computePrice, profitAt } from "@/lib/margin";
import { LIVE } from "@/lib/mode";
import { useSettings, type CountryCode } from "@/lib/settings-store";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/cn";

type LiveDashboard = { stats: Record<CountryCode, DayStats>; orderErrors: { id: string; error: string | null }[]; pausedForStock: number; pausedForBalance: number; pausedForPolicy: number };
type LiveTrend = { cjId: string; title: string; image?: string; cjCost: number; listedNum: number; growthPct?: number; from?: number; sinceDays?: number };

const ZERO: DayStats = { revenue: 0, deltaPct: 0, orders: 0, netProfit: 0, activeListings: 0 };

/** Solde CJ, tout en haut du Dashboard : cliquer mène directement sur CJ pour recharger. */
function CjWalletCard() {
  const { data, error } = useApi<{ amount: number; noWithdrawalAmount: number; freezeAmount: number }>("/api/cj/balance", true);
  const usd = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD" }).format(n);
  const low = data ? data.amount <= 0 : false;
  return (
    <a
      href="https://cjdropshipping.com/my.html"
      target="_blank"
      rel="noopener noreferrer"
      className={cn("mb-4 flex items-center gap-4 rounded-card border p-4 shadow-card transition active:scale-[0.99]", low ? "border-warn/40 bg-warn-50" : "border-black/[0.04] bg-white")}
    >
      <span className={cn("grid size-12 shrink-0 place-items-center rounded-2xl", low ? "bg-warn/15 text-warn" : "bg-brand-50 text-brand-500")}>
        <Wallet className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Solde CJ Dropshipping</p>
        {error ? <p className="text-sm text-danger">{error}</p> : <p className={cn("text-2xl font-extrabold tabular-nums", low && "text-warn")}>{data ? usd(data.amount) : "…"}</p>}
      </div>
      <span className={cn("shrink-0 text-sm font-bold underline", low ? "text-warn" : "text-brand-600")}>{low ? "Recharger" : "Gérer"}</span>
    </a>
  );
}

export function DashboardView() {
  const { pseudo, pricing } = useSettings();
  const toast = useToast();
  const [country, setCountry] = useState<CountryCode>("fr");
  const [seed, setSeed] = useState(0);
  const [refreshing, refresh] = useFakeAction(900);

  const [page, setPage] = useState(1);
  const liveStats = useApi<LiveDashboard>("/api/dashboard", LIVE);
  const liveTrends = useApi<{ trends: LiveTrend[] }>(`/api/trends?page=${page}`, LIVE);
  const liveListings = useApi<{ listings: Listing[] }>("/api/listings", LIVE);

  const stats = LIVE ? (liveStats.data?.stats[country] ?? ZERO) : DASHBOARD[country];
  const currency = COUNTRIES.find((c) => c.code === country)!.currency;

  // « Actualiser » fait tourner la sélection (en vrai : nouvel appel à l'API CJ).
  const trends = useMemo(() => {
    if (LIVE) {
      // Le catalogue CJ ne donne pas les frais de port dans la liste : estimation hors livraison.
      return (liveTrends.data?.trends ?? []).map((p) => ({
        cjId: p.cjId,
        title: p.title,
        image: p.image,
        emoji: undefined as string | undefined,
        hue: undefined as number | undefined,
        cjCost: p.cjCost,
        subtitle: p.growthPct ? `🚀 +${p.growthPct} % de boutiques en ${p.sinceDays} j (${p.from} → ${p.listedNum})` : `${int(p.listedNum)} vendeurs listent ce produit`,
        quote: computePrice({ cjCost: p.cjCost, shipping: 0, signal: { sold30d: 0, sellers: p.listedNum } }, pricing),
      }));
    }
    const shift = (seed * 4 + COUNTRIES.findIndex((c) => c.code === country) * 2) % CJ_TRENDS.length;
    return [...CJ_TRENDS.slice(shift), ...CJ_TRENDS.slice(0, shift)].slice(0, 6).map((p) => ({
      cjId: p.cjId,
      title: p.title,
      image: undefined as string | undefined,
      emoji: p.emoji as string | undefined,
      hue: p.hue as number | undefined,
      cjCost: p.cjCost,
      subtitle: `${int(p.sold30d)} ventes · ${p.sellers} vendeurs`,
      quote: computePrice({ cjCost: p.cjCost, shipping: p.shipping, signal: p }, pricing),
    }));
  }, [seed, country, pricing, liveTrends.data]);

  const alerts = useMemo(() => {
    const source = LIVE ? (liveListings.data?.listings ?? []) : LISTINGS;
    const low = source.filter((l) => l.status === "active" && profitAt(l.ebayPrice, l.cjCost + l.shipping + pricing.fixedFee, { ...pricing, adRatePct: l.adRate ?? pricing.adRatePct }).belowThreshold).length;
    const stock = LIVE ? (liveStats.data?.pausedForStock ?? 0) : LISTINGS.filter((l) => l.pauseReason === "stock").length;
    const balance = LIVE ? (liveStats.data?.pausedForBalance ?? 0) : LISTINGS.filter((l) => l.pauseReason === "solde").length;
    const policy = LIVE ? (liveStats.data?.pausedForPolicy ?? 0) : LISTINGS.filter((l) => l.pauseReason === "policy").length;
    return { low, stock, balance, policy, errors: LIVE ? (liveStats.data?.orderErrors ?? []) : [] };
  }, [pricing, liveListings.data, liveStats.data]);

  return (
    <>
      <div className="mb-5">
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">Bonjour, {pseudo} 👋</h1>
        <p className="mt-1 text-base text-muted">Voici l&apos;activité de votre boutique aujourd&apos;hui.</p>
      </div>

      {LIVE && <CjWalletCard />}

      <Segmented
        value={country}
        onChange={setCountry}
        options={COUNTRIES.map((c) => ({ value: c.code, label: `${c.flag} ${c.name === "Royaume-Uni" ? "UK" : c.name}` }))}
      />

      <Card className="mt-4 p-6">
        <SectionLabel>Chiffre d&apos;affaires du jour</SectionLabel>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <p className="text-[44px] font-extrabold leading-none tracking-tight tabular-nums">{money(stats.revenue, currency)}</p>
          <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold ${stats.deltaPct >= 0 ? "bg-ok-50 text-[#15803d]" : "bg-warn-50 text-[#b86e0f]"}`}>
            {stats.deltaPct >= 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
            {stats.deltaPct > 0 ? "+" : ""}
            {stats.deltaPct} % vs hier
          </span>
        </div>

        <dl className="mt-6 grid grid-cols-3 gap-3 border-t border-gray-100 pt-5">
          {[
            ["Commandes", int(stats.orders)],
            ["Marge nette", money(stats.netProfit, currency, 0)],
            ["Annonces actives", int(stats.activeListings)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="mt-1 text-2xl font-extrabold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {(alerts.low > 0 || alerts.stock > 0 || alerts.balance > 0 || alerts.policy > 0 || alerts.errors.length > 0) && (
        <div className="mt-4 space-y-3">
          {alerts.low > 0 && (
            <Notice
              icon={<AlertTriangle className="size-5" />}
              action={
                <Link href="/listings" className="shrink-0 font-bold underline">
                  Voir
                </Link>
              }
            >
              <strong>{alerts.low}</strong> annonce{alerts.low > 1 ? "s" : ""} sous votre seuil de marge ({pct(pricing.alertThresholdPct, 0)}).
            </Notice>
          )}
          {alerts.stock > 0 && (
            <Notice icon={<PackageX className="size-5" />}>
              <strong>{alerts.stock}</strong> annonce{alerts.stock > 1 ? "s" : ""} en rupture chez CJ : mise en pause automatique.
            </Notice>
          )}
          {alerts.balance > 0 && (
            <Notice
              icon={<PackageX className="size-5" />}
              action={
                <a href="https://cjdropshipping.com" target="_blank" rel="noopener noreferrer" className="shrink-0 font-bold underline">
                  Recharger
                </a>
              }
            >
              <strong>{alerts.balance}</strong> annonce{alerts.balance > 1 ? "s" : ""} en pause : solde CJ insuffisant pour payer les commandes. Elles reprennent automatiquement dès que vous rechargez.
            </Notice>
          )}
          {alerts.policy > 0 && (
            <Notice
              icon={<ShieldAlert className="size-5" />}
              action={
                <Link href="/listings" className="shrink-0 font-bold underline">
                  Voir
                </Link>
              }
            >
              <strong>{alerts.policy}</strong> annonce{alerts.policy > 1 ? "s" : ""} retirée{alerts.policy > 1 ? "s" : ""} par précaution : risque de non-conformité au règlement eBay sur les dispositifs médicaux.
            </Notice>
          )}
          {alerts.errors.length > 0 && (
            <Notice icon={<AlertTriangle className="size-5" />}>
              <strong>{alerts.errors.length}</strong> commande{alerts.errors.length > 1 ? "s" : ""} en erreur : {alerts.errors[0].error ?? "voir le détail"}
            </Notice>
          )}
        </div>
      )}

      <div className="mb-3 mt-8 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 whitespace-nowrap text-[19px] font-extrabold">
          <Flame className="size-5 text-warn" aria-hidden />
          Produits Tendances
        </h2>
        <Button
          size="sm"
          variant="secondary"
          loading={refreshing}
          icon={<RefreshCw className="size-4" />}
          onClick={() =>
            refresh(() => {
              setSeed((s) => s + 1);
              setPage((p) => p + 1);
              toast(LIVE ? "Tendances CJ actualisées" : "Tendances CJ actualisées (données de démo)");
            })
          }
        >
          Actualiser
        </Button>
      </div>

      {LIVE && liveTrends.error && <Notice icon={<AlertTriangle className="size-5" />}>{liveTrends.error}</Notice>}
      {LIVE && !liveTrends.error && !liveTrends.loading && trends.length === 0 && <p className="text-muted">Aucune tendance : connectez votre clé CJ dans Paramètres.</p>}
      <ul className="space-y-3">
        {trends.map((p) => (
          <li key={p.cjId}>
            <Card className="p-4">
              <div className="flex gap-4">
                <ProductThumb emoji={p.emoji} hue={p.hue} image={p.image} size={72} />
                <div className="min-w-0 flex-1">
                  <h3 className="line-clamp-2 text-[17px] font-bold leading-snug">{p.title}</h3>
                  <p className="mt-1 text-sm text-muted">{p.subtitle}</p>
                </div>
              </div>
              <div className="mt-4 flex items-end justify-between gap-3 border-t border-gray-100 pt-3">
                <div className="flex gap-6">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">CJ</p>
                    <p className="text-lg font-semibold tabular-nums text-muted">{money(p.cjCost)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">eBay conseillé{LIVE ? " (est.)" : ""}</p>
                    <p className="text-lg font-extrabold tabular-nums text-brand-600">{money(p.quote.price)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge tone={p.quote.belowThreshold ? "warn" : "ok"}>+{pct(p.quote.netMarginPct, 0)}</Badge>
                  <p className="mt-1 text-sm font-semibold tabular-nums">{money(p.quote.netProfit)}</p>
                </div>
              </div>
              <Link
                href="/sniper"
                className="mt-3 flex h-11 items-center justify-center gap-1.5 rounded-xl bg-brand-50 text-[15px] font-bold text-brand-700 hover:bg-brand-100"
              >
                Sniper ce produit <ArrowUpRight className="size-4" />
              </Link>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}

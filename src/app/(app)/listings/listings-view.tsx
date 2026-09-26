"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, Eye, Link2, Plus, RefreshCw, Search, Store } from "lucide-react";
import { Button, Card, Field, Input, NumberInput, Notice, ProductThumb, Segmented, Select, Sheet, StatusDot, useFakeAction, useToast } from "@/components/ui";
import { LISTINGS, MARKETPLACES, type Listing } from "@/lib/demo-data";
import { money, pct, signedMoney } from "@/lib/format";
import { computePrice, profitAt } from "@/lib/margin";
import { LIVE } from "@/lib/mode";
import { useSettings } from "@/lib/settings-store";
import { api, useApi } from "@/lib/use-api";
import { cn } from "@/lib/cn";

type Filter = "all" | "active" | "paused";

export function ListingsView() {
  const { pricing } = useSettings();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);
  const [updating, runUpdate] = useFakeAction(1200);
  const [syncing, runSync] = useFakeAction(2200);
  const live = useApi<{ listings: Listing[] }>("/api/listings", LIVE);
  const [liveBusy, setLiveBusy] = useState<"update" | "sync" | null>(null);
  const source = useMemo(() => (LIVE ? (live.data?.listings ?? []) : LISTINGS), [live.data]);

  /** Synchro CJ → eBay réelle (prix, stocks, pauses automatiques). */
  async function liveSync(kind: "update" | "sync") {
    setLiveBusy(kind);
    try {
      const r = await api<{ checked: number; repriced: number; paused: number; resumed: number; errors: string[] }>("/api/sync", {});
      live.reload();
      toast(r.errors.length ? `Synchro partielle : ${r.errors[0]}` : `${r.checked} annonces vérifiées, ${r.repriced} prix, ${r.paused} pauses, ${r.resumed} reprises`, r.errors.length ? "warn" : "ok");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erreur de synchro", "warn");
    } finally {
      setLiveBusy(null);
    }
  }

  // Taux de pub réel de l'annonce si elle est déjà promue, sinon estimation par défaut des Paramètres.
  const calcFor = (l: Listing) => profitAt(l.ebayPrice, l.cjCost + l.shipping + pricing.fixedFee, { ...pricing, adRatePct: l.adRate ?? pricing.adRatePct });

  const rows = useMemo(
    () =>
      source.map((l) => ({ ...l, calc: calcFor(l) })).filter((l) => {
        const q = query.trim().toLowerCase();
        return (filter === "all" || l.status === filter) && (!q || l.title.toLowerCase().includes(q) || l.ebayId.includes(q));
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, filter, pricing, source],
  );

  const lowCount = source.filter((l) => l.status === "active" && calcFor(l).belowThreshold).length;

  return (
    <>
      <div className="mb-5">
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">Mes Listings</h1>
        <p className="mt-1 text-base text-muted">{source.length} produits</p>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <Button loading={LIVE ? liveBusy === "update" : updating} icon={<RefreshCw className="size-5" />} className="h-auto min-h-16 flex-col gap-1 px-2 py-2.5 text-[15px] leading-tight sm:flex-row" onClick={() => (LIVE ? liveSync("update") : runUpdate(() => toast("Prix et stocks CJ mis à jour (démo)")))}>
          Mettre à jour
        </Button>
        <Button variant="secondary" loading={LIVE ? liveBusy === "sync" : syncing} icon={<Store className="size-5" />} className="h-auto min-h-16 flex-col gap-1 px-2 py-2.5 text-[15px] leading-tight sm:flex-row" onClick={() => (LIVE ? liveSync("sync") : runSync(() => toast("Synchronisation complète eBay ↔ CJ terminée (démo)")))}>
          Sync complet
        </Button>
        <Button variant="secondary" icon={<Plus className="size-5" />} className="h-auto min-h-16 flex-col gap-1 px-2 py-2.5 text-[15px] leading-tight sm:flex-row" onClick={() => setAdding(true)}>
          Ajouter
        </Button>
      </div>

      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
        <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher par titre ou ID…" className="h-14 pl-12" aria-label="Rechercher une annonce" />
      </div>

      <div className="mt-3">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "Tous" },
            { value: "active", label: "Actifs" },
            { value: "paused", label: "En pause" },
          ]}
        />
      </div>

      {lowCount > 0 && (
        <div className="mt-4">
          <Notice icon={<AlertTriangle className="size-5" />}>
            {lowCount} annonce{lowCount > 1 ? "s" : ""} sous votre seuil de marge ({pct(pricing.alertThresholdPct, 0)}). Ajustez le prix ou le seuil dans Paramètres.
          </Notice>
        </div>
      )}

      <ul className="mt-5 space-y-4">
        {rows.map((l) => (
          <li key={l.ebayId}>
            <ListingCard listing={l} calc={l.calc} />
          </li>
        ))}
      </ul>

      {LIVE && live.error && (
        <div className="mt-5">
          <Notice icon={<AlertTriangle className="size-5" />}>{live.error}</Notice>
        </div>
      )}
      {rows.length === 0 && !live.error && (
        <Card className="mt-5 p-8 text-center">
          <p className="text-lg font-bold">{LIVE && source.length === 0 ? "Aucune annonce pour l'instant" : "Aucune annonce trouvée"}</p>
          <p className="mt-1 text-muted">{LIVE && source.length === 0 ? "Lancez le Product Sniper ou ajoutez un produit CJ." : "Essayez un autre titre ou identifiant."}</p>
        </Card>
      )}

      <AddSheet open={adding} onClose={() => setAdding(false)} onAdded={live.reload} />
    </>
  );
}

function ListingCard({ listing: l, calc }: { listing: Listing; calc: ReturnType<typeof profitAt> }) {
  const toast = useToast();
  const active = l.status === "active";
  const iconBtn = "grid size-11 place-items-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200";

  return (
    <Card className="p-5">
      <div className="flex gap-4">
        <ProductThumb emoji={l.emoji} hue={l.hue} image={l.image} size={84} />
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-lg font-bold leading-snug">{l.title}</h3>
          <p className="mt-1 text-[15px] tabular-nums text-muted">{l.ebayId}</p>
        </div>
      </div>

      <div className="-mx-1 mt-3 flex justify-end gap-1">
        <button className={iconBtn} aria-label="Voir le détail" onClick={() => toast(l.error ?? (LIVE ? "Aucun problème détecté sur cette annonce" : "Détail de l'annonce : démo"), l.error ? "warn" : "ok")}>
          <Eye className="size-6" />
        </button>
        <a className={iconBtn} aria-label="Ouvrir sur eBay" href={`https://www.ebay.${l.market === "de" ? "de" : l.market === "uk" ? "co.uk" : "fr"}/itm/${l.ebayId}`} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="size-6" />
        </a>
        <a
          className={cn(iconBtn, l.supplierOk ? "text-brand-500" : "text-warn hover:text-warn")}
          aria-label={l.supplierOk ? "Lien fournisseur CJ" : "Lien fournisseur à vérifier"}
          title={l.supplierOk ? "Lien fournisseur CJ" : "Lien fournisseur à vérifier : le produit a changé chez CJ"}
          href={LIVE ? `https://cjdropshipping.com/product/-p-${l.cjId}.html` : `https://cjdropshipping.com/product/${l.cjId}.html`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Link2 className="size-6" />
        </a>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-3 border-t border-gray-100 pt-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">eBay</p>
          <p className="mt-1.5 text-[22px] font-extrabold tabular-nums text-brand-600">{money(l.ebayPrice)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">CJ</p>
          <p className="mt-1.5 text-[22px] font-medium tabular-nums text-muted">{money(l.cjCost)}</p>
          {l.shipping > 0 && <p className="text-sm text-muted">+ {money(l.shipping)} port</p>}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Marge</p>
          <p className={cn("mt-1.5 text-[22px] font-extrabold tabular-nums", calc.belowThreshold ? "text-warn" : "text-brand-600")}>{signedMoney(calc.netProfit)}</p>
          <p className={cn("text-[15px] font-medium tabular-nums", calc.belowThreshold ? "text-warn" : "text-brand-500")}>{pct(calc.netMarginPct)}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <StatusDot tone={active ? "brand" : l.pauseReason === "stock" || l.pauseReason === "solde" || l.pauseReason === "policy" ? "warn" : "off"}>{active ? "Actif" : "En pause"}</StatusDot>
        {l.pauseReason === "stock" && <span className="text-sm font-medium text-[#b86e0f]">Rupture de stock CJ</span>}
        {l.pauseReason === "solde" && <span className="text-sm font-medium text-[#b86e0f]">Solde CJ insuffisant — ajoutez des fonds sur CJ</span>}
        {l.pauseReason === "policy" && <span className="text-sm font-medium text-[#b86e0f]">Retiré par précaution (règlement eBay)</span>}
        {l.pauseReason === "no_sale" && <span className="text-sm font-medium text-[#b86e0f]">Retiré : aucune vente en 15 jours</span>}
        {active && calc.belowThreshold && <span className="text-sm font-medium text-[#b86e0f]">Marge sous le seuil</span>}
        {l.error && <span className="text-sm font-medium text-danger">{l.error}</span>}
      </div>
    </Card>
  );
}

function AddSheet({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const { pricing } = useSettings();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  const [market, setMarket] = useState("fr");
  const [cost, setCost] = useState(10);
  const [shipping, setShipping] = useState(1);

  const quote = computePrice({ cjCost: cost, shipping }, pricing);

  return (
    <Sheet open={open} onClose={onClose} title="Ajouter un produit CJ">
      <div className="space-y-4">
        <Field label="Lien ou ID produit CJ">
          <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://cjdropshipping.com/product/…" inputMode="url" autoCapitalize="none" />
        </Field>
        <Field label="Marketplace">
          <Select value={market} onChange={setMarket} options={MARKETPLACES} />
        </Field>
        {LIVE ? (
          <p className="text-sm text-muted">Le coût, la livraison et le stock sont lus chez CJ, le prix est calculé avec vos marges, puis l&apos;annonce est publiée sur eBay.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Coût CJ (€)" hint="Sera lu via l'API CJ">
                <NumberInput value={cost} onChange={setCost} min={0} />
              </Field>
              <Field label="Livraison (€)">
                <NumberInput value={shipping} onChange={setShipping} min={0} />
              </Field>
            </div>
            <div className="rounded-2xl bg-brand-50 p-4">
              <p className="text-sm font-semibold text-brand-700">Prix eBay calculé</p>
              <p className="mt-1 text-3xl font-extrabold tabular-nums">{money(quote.price)}</p>
              <p className="mt-1 text-sm text-muted">
                Marge nette {signedMoney(quote.netProfit)} ({pct(quote.netMarginPct, 0)}), palier {quote.baseMarginPct} %
              </p>
            </div>
          </>
        )}
        <Button
          full
          size="lg"
          loading={busy}
          disabled={link.trim().length < 3}
          onClick={async () => {
            if (!LIVE) {
              toast("Produit ajouté à la file de création (démo)");
              setLink("");
              onClose();
              return;
            }
            setBusy(true);
            try {
              const r = await api<{ listing: { title: string; price: number } }>("/api/listings/add", { link, market });
              toast(`Annonce créée : ${money(r.listing.price)}`);
              setLink("");
              onClose();
              onAdded();
            } catch (e) {
              toast(e instanceof Error ? e.message : "Erreur", "warn");
            } finally {
              setBusy(false);
            }
          }}
        >
          Créer l&apos;annonce
        </Button>
      </div>
    </Sheet>
  );
}

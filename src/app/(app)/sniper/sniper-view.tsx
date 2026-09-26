"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Circle, Loader2, Play, Zap } from "lucide-react";
import { Badge, Button, Card, Field, Notice, NumberInput, ProductThumb, SectionLabel, Select, UsageBar, useToast } from "@/components/ui";
import { CATEGORIES, CJ_TRENDS, MARKETPLACES } from "@/lib/demo-data";
import { money, pct } from "@/lib/format";
import { computePrice } from "@/lib/margin";
import { PLANS } from "@/lib/plans";
import { LIVE } from "@/lib/mode";
import { setUsage, updateSettings, useSettings } from "@/lib/settings-store";
import { PRICE_TIER_LABELS, inPriceTier, type PriceTier } from "@/lib/price-tiers";
import { api } from "@/lib/use-api";
import { cn } from "@/lib/cn";

const STEPS = ["Récupération des produits tendance CJ", "Vérification du stock et des frais de livraison", "Calcul des prix et des marges", "Création des annonces eBay"];
const STEP_MS = 900;

type Sort = "popularity" | "sales" | "new";

export function SniperView() {
  const settings = useSettings();
  const { plan, pricing, usage, cj } = settings;
  const quotas = PLANS[plan].quotas;
  const toast = useToast();

  const [count, setCount] = useState(10);
  const [targetMargin, setTargetMargin] = useState(30);
  const [market, setMarket] = useState("fr");
  const [sort, setSort] = useState<Sort>("popularity");
  const [priceTier, setPriceTier] = useState<PriceTier>("all");
  const [cats, setCats] = useState<string[]>([]);
  const [step, setStep] = useState<number | null>(null); // null = au repos
  const [result, setResult] = useState<{ requested: number; made: number } | null>(null);
  const [liveResult, setLiveResult] = useState<{ created: { title: string; price: number; netMarginPct: number; image: string }[]; failed: { name: string; error: string }[] } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const running = step !== null && step < STEPS.length;
  const quotaReached = usage.sniperRuns >= quotas.sniperRuns;
  const effectiveCount = Math.min(count, quotas.sniperProducts);

  /** Vrai Sniper : le serveur récupère les produits CJ, calcule les prix et publie sur eBay. */
  async function launchLive() {
    setResult(null);
    setLiveResult(null);
    setStep(0);
    // L'appel dure plusieurs dizaines de secondes : on fait avancer les étapes pendant l'attente.
    const tick = setInterval(() => setStep((s) => (s !== null && s < STEPS.length - 1 ? s + 1 : s)), 7000);
    try {
      const r = await api<{ created: NonNullable<typeof liveResult>["created"]; failed: NonNullable<typeof liveResult>["failed"]; made: number; usage: Parameters<typeof setUsage>[0] }>("/api/sniper", { count, targetMargin, market, sort, categories: cats, priceTier });
      setUsage(r.usage);
      setLiveResult({ created: r.created, failed: r.failed });
      setResult({ requested: count, made: r.made });
      setStep(STEPS.length);
      toast(`${r.made} annonce${r.made > 1 ? "s" : ""} créée${r.made > 1 ? "s" : ""} sur eBay`);
    } catch (e) {
      setStep(null);
      toast(e instanceof Error ? e.message : "Erreur du Sniper", "warn");
    } finally {
      clearInterval(tick);
    }
  }

  function launch() {
    if (LIVE) return void launchLive();
    setResult(null);
    setStep(0);
    const advance = (i: number) => {
      timer.current = setTimeout(() => {
        if (i + 1 < STEPS.length) {
          setStep(i + 1);
          advance(i + 1);
        } else {
          setStep(STEPS.length);
          setResult({ requested: count, made: effectiveCount });
          updateSettings((s) => ({ usage: { ...s.usage, sniperRuns: s.usage.sniperRuns + 1 } }));
          toast(`${effectiveCount} annonces créées (démo)`);
        }
      }, STEP_MS);
    };
    advance(0);
  }

  // Sélection des produits du run : filtrés par catégorie, triés par popularité (vendeurs bas + ventes) ou ventes.
  const picks = LIVE ? [] : (() => {
    const pool = CJ_TRENDS.filter((p) => cats.length === 0 || cats.includes(p.category));
    const sorted = [...pool]
      .map((p) => ({ ...p, quote: computePrice({ cjCost: p.cjCost, shipping: p.shipping, signal: p, minMarginPct: targetMargin }, pricing) }))
      .filter((p) => inPriceTier(p.quote.price, priceTier))
      .sort((a, b) => (sort === "sales" ? b.sold30d - a.sold30d : b.sold30d / (b.sellers + 5) - a.sold30d / (a.sellers + 5)));
    return sorted.slice(0, result?.made ?? effectiveCount);
  })();

  return (
    <>
      <Card className="p-6">
        <div className="flex items-center gap-4">
          <div className="grid size-16 shrink-0 place-items-center rounded-2xl border border-brand-200 bg-brand-50">
            <Zap className="size-9 text-brand-400" aria-hidden />
          </div>
          <div>
            <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">Product Sniper</h1>
            <p className="text-lg text-muted">Listing 100&nbsp;% automatique</p>
          </div>
        </div>

        {quotaReached ? (
          <Button full size="lg" variant="warning" href="/profil#plans" icon={<Zap className="size-5" />} className="mt-5">
            Quota atteint ({usage.sniperRuns}/{quotas.sniperRuns}) — Premium
          </Button>
        ) : (
          <Button full size="lg" className="mt-5" loading={running} icon={<Play className="size-5" />} onClick={launch}>
            {running ? "Sniper en cours…" : "Lancer le Sniper"}
          </Button>
        )}

        {!LIVE && !cj.connected && (
          <p className="mt-3 text-sm text-muted">
            Démo : la connexion CJ est simulée. Ajoutez votre clé API dans{" "}
            <Link href="/parametres#connexions" className="font-semibold text-brand-600 underline">
              Paramètres
            </Link>{" "}
            pour l&apos;étape « API réelle ».
          </p>
        )}

        <div className="mt-6">
          <SectionLabel>Paramètres</SectionLabel>
          <div className="mt-4 space-y-5">
            <Field label="Produits à sniper" hint={count > quotas.sniperProducts ? `Plan ${PLANS[plan].name} : ${quotas.sniperProducts} produits max par lancement.` : undefined}>
              <NumberInput value={count} onChange={(n) => setCount(Math.round(n))} min={1} max={100} />
            </Field>
            <Field label="Marge cible (%)" hint="Marge nette minimale sur le coût. Les paliers automatiques s'appliquent s'ils sont plus élevés.">
              <NumberInput value={targetMargin} onChange={setTargetMargin} min={0} max={500} />
            </Field>
            <Field label="Marketplace">
              <Select value={market} onChange={setMarket} options={MARKETPLACES} />
            </Field>
            <Field label="Trier les produits CJ par" hint={sort === "new" ? "Produits récents, peu vendus par les autres boutiques : concurrence faible, mais demande non prouvée. Testez avec peu de produits." : undefined}>
              <Select
                value={sort}
                onChange={(v) => setSort(v as Sort)}
                options={[
                  { value: "popularity", label: "Popularité" },
                  { value: "sales", label: "Nombre de ventes" },
                  { value: "new", label: "Nouveautés (avant la foule)" },
                ]}
              />
            </Field>
            <Field label="Tranche de prix eBay visée" hint="Estimation hors livraison : le prix final peut dépasser la tranche une fois le port ajouté.">
              <Select
                value={priceTier}
                onChange={(v) => setPriceTier(v as PriceTier)}
                options={(Object.keys(PRICE_TIER_LABELS) as PriceTier[]).map((k) => ({ value: k, label: PRICE_TIER_LABELS[k] }))}
              />
            </Field>
            <fieldset>
              <legend className="mb-2 text-[15px] font-semibold">Catégories</legend>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => {
                  const on = cats.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setCats((cur) => (on ? cur.filter((x) => x !== c) : [...cur, c]))}
                      className={cn(
                        "h-11 rounded-full border px-4 text-[15px] font-semibold transition",
                        on ? "border-brand-400 bg-brand-50 text-brand-700" : "border-gray-200 bg-white text-muted",
                      )}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-sm text-muted">{cats.length === 0 ? "Aucune sélection : toutes les catégories." : `${cats.length} sélectionnée${cats.length > 1 ? "s" : ""}.`}</p>
            </fieldset>
          </div>
        </div>
      </Card>

      <Card className="mt-4 p-6">
        <SectionLabel>Quota du plan {PLANS[plan].name}</SectionLabel>
        <div className="mt-4">
          <UsageBar label="Lancements aujourd'hui" used={usage.sniperRuns} max={quotas.sniperRuns} />
        </div>
        {plan === "free" && <p className="mt-3 text-sm text-muted">Free : {quotas.sniperProducts} produits max par lancement. Pro : {PLANS.pro.quotas.sniperProducts}.</p>}
      </Card>

      {step !== null && (
        <Card className="mt-4 p-6">
          <SectionLabel>Progression</SectionLabel>
          <ol className="mt-4 space-y-3">
            {STEPS.map((label, i) => {
              const done = step > i;
              const current = step === i;
              return (
                <li key={label} className={cn("flex items-center gap-3 text-[16px]", !done && !current && "text-gray-400")}>
                  {done ? <CheckCircle2 className="size-6 text-ok" /> : current ? <Loader2 className="size-6 animate-spin text-brand-500" /> : <Circle className="size-6" />}
                  <span className={cn(current && "font-semibold")}>{label}</span>
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      {result && (
        <div className="mt-4 space-y-3">
          {result.requested > quotas.sniperProducts && (
            <Notice icon={<Zap className="size-5" />} action={<Link href="/profil#plans" className="shrink-0 font-bold underline">Passer Pro</Link>}>
              Quota atteint — Premium : {result.made} produits sur {result.requested} demandés.
            </Notice>
          )}
          <h2 className="pt-2 text-xl font-extrabold">{LIVE ? liveResult?.created.length : picks.length} annonces créées</h2>
          {liveResult?.created.map((c) => (
            <Card key={c.title} className="flex items-center gap-4 p-4">
              <ProductThumb image={c.image} size={60} />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 font-bold leading-snug">{c.title}</p>
                <p className="mt-0.5 text-sm text-muted tabular-nums">
                  Publiée à <span className="font-bold text-brand-600">{money(c.price)}</span>
                </p>
              </div>
              <Badge tone="ok">{pct(c.netMarginPct, 0)}</Badge>
            </Card>
          ))}
          {liveResult && liveResult.failed.length > 0 && (
            <Notice icon={<Zap className="size-5" />}>
              {liveResult.failed.length} produit{liveResult.failed.length > 1 ? "s" : ""} ignoré{liveResult.failed.length > 1 ? "s" : ""}. Ex. « {liveResult.failed[0].name.slice(0, 40)} » : {liveResult.failed[0].error}
            </Notice>
          )}
          <ul className="space-y-3">
            {picks.map((p) => (
              <li key={p.cjId}>
                <Card className="flex items-center gap-4 p-4">
                  <ProductThumb emoji={p.emoji} hue={p.hue} size={60} />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 font-bold leading-snug">{p.title}</p>
                    <p className="mt-0.5 text-sm text-muted tabular-nums">
                      CJ {money(p.cjCost)} → eBay <span className="font-bold text-brand-600">{money(p.quote.price)}</span>
                    </p>
                  </div>
                  <Badge tone="ok">{pct(p.quote.netMarginPct, 0)}</Badge>
                </Card>
              </li>
            ))}
          </ul>
          {!LIVE && picks.length === 0 && <p className="text-muted">Aucun produit CJ ne correspond à ces catégories.</p>}
        </div>
      )}
    </>
  );
}

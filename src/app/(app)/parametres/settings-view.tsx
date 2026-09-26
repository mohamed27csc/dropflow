"use client";

import { useState, type ReactNode } from "react";
import { AlertTriangle, Bell, Check, Hash, KeyRound, RefreshCw, RotateCcw, Settings2, ShoppingCart, Trash2 } from "lucide-react";
import { Button, Card, Field, Input, Notice, NumberInput, PageHeader, SectionLabel, Select, Sheet, Toggle, StatusDot, useToast } from "@/components/ui";
import { useRouter } from "next/navigation";
import { COUNTRIES } from "@/lib/demo-data";
import { money, pct, signedMoney } from "@/lib/format";
import { computePrice, DEFAULT_PRICING, DEMAND_HIGH, SELLERS_HIGH, SELLERS_LOW, type PricingSettings } from "@/lib/margin";
import { LIVE } from "@/lib/mode";
import { refreshSettings, updateSettings, useServerInfo, useSettings, type CountryCode, type Settings } from "@/lib/settings-store";
import { api, useApi } from "@/lib/use-api";
import { cn } from "@/lib/cn";

const usd = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD" }).format(n);

/** Solde du portefeuille CJ (celui qui paie les commandes en mode automatique). */
function CjWallet() {
  const { data, error, loading, reload } = useApi<{ amount: number; noWithdrawalAmount: number; freezeAmount: number }>("/api/cj/balance", true);
  return (
    <div className="mt-4 rounded-2xl bg-gray-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-muted">Solde CJ</span>
        <button onClick={reload} disabled={loading} aria-label="Actualiser le solde" className="grid size-8 place-items-center rounded-full text-muted hover:bg-gray-200 disabled:opacity-50">
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
        </button>
      </div>
      {error ? (
        <p className="mt-1 text-sm text-danger">{error}</p>
      ) : data ? (
        <>
          <p className={cn("mt-1 text-3xl font-extrabold tabular-nums", data.amount <= 0 && "text-warn")}>{usd(data.amount)}</p>
          {(data.noWithdrawalAmount > 0 || data.freezeAmount > 0) && (
            <p className="mt-1 text-sm text-muted tabular-nums">
              {data.noWithdrawalAmount > 0 && `${usd(data.noWithdrawalAmount)} non retirable`}
              {data.noWithdrawalAmount > 0 && data.freezeAmount > 0 && " · "}
              {data.freezeAmount > 0 && `${usd(data.freezeAmount)} gelé`}
            </p>
          )}
          {data.amount <= 0 && <p className="mt-2 text-sm font-semibold text-[#b86e0f]">Rechargez pour que les commandes automatiques puissent être payées.</p>}
        </>
      ) : (
        <p className="mt-1 text-sm text-muted">Chargement…</p>
      )}
    </div>
  );
}

const SECTIONS = [
  ["connexions", "Connexions"],
  ["marges", "Marges"],
  ["synchro", "Synchro"],
  ["auto-order", "Auto-Order"],
] as const;

export function SettingsView({ flash }: { flash: { ok: boolean; text: string } | null }) {
  const s = useSettings();
  const server = useServerInfo();
  return (
    <>
      <PageHeader title="Paramètres" />
      {flash && (
        <div className="mb-4">
          <Notice tone={flash.ok ? "ok" : "warn"}>{flash.text}</Notice>
        </div>
      )}
      {LIVE && server && server.missing.length > 0 && (
        <div className="mb-4">
          <Notice icon={<AlertTriangle className="size-5" />}>
            <strong>Configuration serveur incomplète.</strong> Variables manquantes sur Vercel : {server.missing.join(", ")}. Voir le README.
          </Notice>
        </div>
      )}
      <nav aria-label="Sections" className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="h-11 shrink-0 rounded-full border border-gray-200 bg-white px-5 text-[15px] font-semibold leading-[2.75rem] shadow-card">
            {label}
          </a>
        ))}
      </nav>

      <Connections s={s} />
      <Margins pricing={s.pricing} />
      <Sync sync={s.sync} />
      <AutoOrder autoOrder={s.autoOrder} />
      <DangerZone />
    </>
  );
}

/* ───────── Blocs communs ───────── */

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mb-8 scroll-mt-24">
      <SectionLabel className="mb-3 px-1">{title}</SectionLabel>
      {children}
    </section>
  );
}

function Row({ icon, title, hint, children, stack }: { icon: ReactNode; title: string; hint?: string; children?: ReactNode; stack?: boolean }) {
  return (
    <div className="border-t border-gray-100 p-5 first:border-t-0">
      <div className="flex items-center gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gray-100 text-muted">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-bold leading-snug">{title}</p>
          {hint && <p className="text-[15px] leading-snug text-muted">{hint}</p>}
        </div>
        {!stack && children}
      </div>
      {stack && <div className="mt-4">{children}</div>}
    </div>
  );
}

/* ───────── Connexions ───────── */

function Connections({ s }: { s: Settings }) {
  const toast = useToast();
  const [key, setKey] = useState("");
  const [printfulKey, setPrintfulKey] = useState("");
  const [vintedKey, setVintedKey] = useState("");
  const [vintedBusy, setVintedBusy] = useState(false);

  const setEbay = (code: CountryCode, connected: boolean) =>
    updateSettings((cur) => ({ ebay: { ...cur.ebay, [code]: { ...cur.ebay[code], connected } } }));

  async function disconnectEbay(code: CountryCode, name: string) {
    try {
      if (LIVE) {
        await api("/api/ebay/disconnect", { market: code });
        await refreshSettings();
      } else setEbay(code, false);
      toast(`${name} déconnecté`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erreur", "warn");
    }
  }

  function connectEbayDemo(code: CountryCode) {
    setEbay(code, true);
    toast("Connexion simulée (mode démo).");
  }

  const [cjBusy, setCjBusy] = useState(false);
  async function connectCj() {
    if (!LIVE) {
      updateSettings({ cj: { connected: true, keyHint: key.trim().slice(-4) } });
      setKey("");
      toast("Connexion simulée (mode démo).");
      return;
    }
    setCjBusy(true);
    try {
      await api("/api/cj/connect", { apiKey: key.trim() });
      setKey("");
      await refreshSettings();
      toast("CJ Dropshipping connecté");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erreur", "warn");
    } finally {
      setCjBusy(false);
    }
  }
  async function disconnectCj() {
    try {
      if (LIVE) {
        await api("/api/cj/connect", undefined, "DELETE");
        await refreshSettings();
      } else updateSettings({ cj: { connected: false, keyHint: "" } });
      toast("CJ déconnecté");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erreur", "warn");
    }
  }

  const [printfulBusy, setPrintfulBusy] = useState(false);
  async function connectPrintful() {
    if (!LIVE) {
      updateSettings({ printful: { connected: true, keyHint: printfulKey.trim().slice(-4) } });
      setPrintfulKey("");
      toast("Connexion simulée (mode démo).");
      return;
    }
    setPrintfulBusy(true);
    try {
      await api("/api/printful/connect", { apiToken: printfulKey.trim() });
      setPrintfulKey("");
      await refreshSettings();
      toast("Printful connecté");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erreur", "warn");
    } finally {
      setPrintfulBusy(false);
    }
  }
  async function disconnectPrintful() {
    try {
      if (LIVE) {
        await api("/api/printful/connect", undefined, "DELETE");
        await refreshSettings();
      } else updateSettings({ printful: { connected: false, keyHint: "" } });
      toast("Printful déconnecté");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erreur", "warn");
    }
  }

  async function connectVinted() {
    if (!LIVE) {
      updateSettings({ vinted: { connected: true, keyHint: vintedKey.trim().slice(-4) } });
      setVintedKey("");
      toast("Connexion simulée (mode démo).");
      return;
    }
    setVintedBusy(true);
    try {
      await api("/api/vinted/connect", { apiKey: vintedKey.trim() });
      setVintedKey("");
      await refreshSettings();
      toast("Clé Vinted enregistrée (non vérifiée)");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erreur", "warn");
    } finally {
      setVintedBusy(false);
    }
  }
  async function disconnectVinted() {
    try {
      if (LIVE) {
        await api("/api/vinted/connect", undefined, "DELETE");
        await refreshSettings();
      } else updateSettings({ vinted: { connected: false, keyHint: "" } });
      toast("Clé Vinted supprimée");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erreur", "warn");
    }
  }

  return (
    <Section id="connexions" title="Connexions">
      <div className="space-y-4">
        {COUNTRIES.map((c) => {
          const acc = s.ebay[c.code];
          return (
            <Card key={c.code} className={cn("relative p-5", acc.connected && "border-2 border-ok/25 bg-ok-50")}>
              {acc.connected && (
                <span className="absolute -right-1.5 -top-1.5 grid size-9 place-items-center rounded-full bg-ok text-white shadow" aria-hidden>
                  <Check className="size-5" strokeWidth={3} />
                </span>
              )}
              <div className="flex items-center gap-4">
                <span className="grid size-16 place-items-center rounded-2xl bg-brand-400 text-3xl shadow-card" aria-hidden>
                  {c.flag}
                </span>
                <div>
                  <h3 className="text-xl font-extrabold">{c.name}</h3>
                  <p className="text-muted">{c.domain}</p>
                </div>
              </div>
              {acc.connected ? (
                <>
                  <div className="mt-4">
                    <StatusDot tone="ok">
                      <span className="text-[#15803d]">Connecté</span>
                    </StatusDot>
                    <p className="mt-3 font-semibold text-brand-500">{acc.shop ? `@${acc.shop}` : "Compte eBay"}</p>
                  </div>
                  <button className="mt-4 h-12 w-full rounded-2xl text-lg font-bold text-danger hover:bg-red-50" onClick={() => disconnectEbay(c.code, c.name)}>
                    Déconnecter
                  </button>
                </>
              ) : (
                <Button full className="mt-4" href={LIVE ? `/api/ebay/connect?market=${c.code}` : undefined} onClick={LIVE ? undefined : () => connectEbayDemo(c.code)}>
                  Connecter avec eBay
                </Button>
              )}
            </Card>
          );
        })}

        <Card className="p-5">
          <div className="flex items-center gap-4">
            <span className="grid size-16 place-items-center rounded-2xl bg-ink text-xl font-extrabold text-brand-400 shadow-card" aria-hidden>
              CJ
            </span>
            <div>
              <h3 className="text-xl font-extrabold">CJ Dropshipping</h3>
              <p className="text-muted">Clé API CJ</p>
            </div>
          </div>
          {s.cj.connected ? (
            <>
              <div className="mt-4">
                <StatusDot tone="ok">
                  <span className="text-[#15803d]">Connecté</span>
                </StatusDot>
                <p className="mt-3 font-semibold tabular-nums text-brand-500">Clé •••• {s.cj.keyHint}</p>
              </div>
              {LIVE && <CjWallet />}
              <button className="mt-4 h-12 w-full rounded-2xl text-lg font-bold text-danger hover:bg-red-50" onClick={disconnectCj}>
                Déconnecter
              </button>
            </>
          ) : (
            <div className="mt-4 space-y-3">
              <Input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Collez votre clé API CJ" autoComplete="off" autoCapitalize="none" spellCheck={false} aria-label="Clé API CJ Dropshipping" />
              <Button full loading={cjBusy} disabled={key.trim().length < 8} icon={<KeyRound className="size-5" />} onClick={connectCj}>
                Connecter
              </Button>
              <p className="text-sm text-muted">
                {LIVE
                  ? "La clé est vérifiée auprès de CJ puis stockée chiffrée côté serveur. Elle n'est jamais renvoyée au navigateur. Trouvez-la dans CJ : Compte → API."
                  : "Démo : la clé n'est pas enregistrée, seuls ses 4 derniers caractères sont conservés pour l'affichage."}
              </p>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-4">
            <span className="grid size-16 place-items-center rounded-2xl bg-ink text-xl font-extrabold text-brand-400 shadow-card" aria-hidden>
              PF
            </span>
            <div>
              <h3 className="text-xl font-extrabold">Printful</h3>
              <p className="text-muted">Impression à la demande — jeton API</p>
            </div>
          </div>
          {s.printful.connected ? (
            <>
              <div className="mt-4">
                <StatusDot tone="ok">
                  <span className="text-[#15803d]">Connecté</span>
                </StatusDot>
                <p className="mt-3 font-semibold tabular-nums text-brand-500">Jeton •••• {s.printful.keyHint}</p>
              </div>
              <p className="mt-3 text-sm text-muted">Fournisseur connecté, mais pas encore relié à la publication automatique — chaque produit a besoin d&apos;un visuel fourni.</p>
              <button className="mt-4 h-12 w-full rounded-2xl text-lg font-bold text-danger hover:bg-red-50" onClick={disconnectPrintful}>
                Déconnecter
              </button>
            </>
          ) : (
            <div className="mt-4 space-y-3">
              <Input type="password" value={printfulKey} onChange={(e) => setPrintfulKey(e.target.value)} placeholder="Collez votre jeton API Printful" autoComplete="off" autoCapitalize="none" spellCheck={false} aria-label="Jeton API Printful" />
              <Button full loading={printfulBusy} disabled={printfulKey.trim().length < 8} icon={<KeyRound className="size-5" />} onClick={connectPrintful}>
                Connecter
              </Button>
              <p className="text-sm text-muted">
                {LIVE
                  ? "Le jeton est vérifié auprès de Printful puis stocké chiffré côté serveur. Trouvez-le dans Printful : Réglages → API."
                  : "Démo : le jeton n'est pas enregistré, seuls ses 4 derniers caractères sont conservés pour l'affichage."}
              </p>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-4">
            <span className="grid size-16 place-items-center rounded-2xl bg-ink text-xl font-extrabold text-brand-400 shadow-card" aria-hidden>
              VT
            </span>
            <div>
              <h3 className="text-xl font-extrabold">Vinted</h3>
              <p className="text-muted">Clé API Vinted</p>
            </div>
          </div>
          {s.vinted.connected ? (
            <>
              <div className="mt-4">
                <StatusDot tone="warn">Clé enregistrée, non vérifiée</StatusDot>
                <p className="mt-3 font-semibold tabular-nums text-brand-500">Clé •••• {s.vinted.keyHint}</p>
              </div>
              <p className="mt-3 text-sm text-muted">Stockée chiffrée. DropFlow ne peut pas encore la valider auprès de Vinted ni publier avec : il manque la documentation officielle de leur API.</p>
              <button className="mt-4 h-12 w-full rounded-2xl text-lg font-bold text-danger hover:bg-red-50" onClick={disconnectVinted}>
                Supprimer la clé
              </button>
            </>
          ) : (
            <div className="mt-4 space-y-3">
              <Input type="password" value={vintedKey} onChange={(e) => setVintedKey(e.target.value)} placeholder="Collez votre clé API Vinted" autoComplete="off" autoCapitalize="none" spellCheck={false} aria-label="Clé API Vinted" />
              <Button full loading={vintedBusy} disabled={vintedKey.trim().length < 8} icon={<KeyRound className="size-5" />} onClick={connectVinted}>
                Enregistrer
              </Button>
              <p className="text-sm text-muted">La clé est stockée chiffrée côté serveur, mais pas vérifiée auprès de Vinted (pas d&apos;API publique documentée).</p>
            </div>
          )}
          <Button full className="mt-3" variant="secondary" href="/vinted">
            Ouvrir l&apos;assistant Vinted
          </Button>
        </Card>
      </div>
    </Section>
  );
}

/* ───────── Marges ───────── */

function tierLabel(prev: number | null, upTo: number | null) {
  if (upTo === null) return `> ${prev} €`;
  return prev === null ? `< ${upTo} €` : `${prev} – ${upTo} €`;
}

function Margins({ pricing }: { pricing: PricingSettings }) {
  const { fx } = useSettings();
  const set = (patch: Partial<PricingSettings>) => updateSettings({ pricing: { ...pricing, ...patch } });
  const sorted = [...pricing.tiers].sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity));

  return (
    <Section id="marges" title="Marges & prix">
      <Card>
        <div className="p-5">
          <p className="text-[17px] font-bold">Marge par palier de prix d&apos;achat</p>
          <p className="mt-1 text-[15px] text-muted">Marge nette visée sur le coût CJ, après frais eBay.</p>
          <ul className="mt-4 space-y-3">
            {sorted.map((t, i) => (
              <li key={t.upTo ?? "max"} className="flex items-center justify-between gap-4">
                <span className="text-[17px] font-semibold tabular-nums">{tierLabel(i === 0 ? null : sorted[i - 1].upTo, t.upTo)}</span>
                <div className="flex w-32 items-center gap-2">
                  <NumberInput
                    value={t.marginPct}
                    min={0}
                    max={1000}
                    className="text-center"
                    aria-label={`Marge pour ${tierLabel(i === 0 ? null : sorted[i - 1].upTo, t.upTo)}`}
                    onChange={(v) => set({ tiers: pricing.tiers.map((x) => (x.upTo === t.upTo ? { ...x, marginPct: v } : x)) })}
                  />
                  <span className="font-semibold text-muted">%</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-gray-100 p-5">
          <Field label="Frais eBay (%)">
            <NumberInput value={pricing.ebayFeePct} min={0} max={50} onChange={(v) => set({ ebayFeePct: v })} />
          </Field>
          <Field label="Frais fixes (€)">
            <NumberInput value={pricing.fixedFee} min={0} onChange={(v) => set({ fixedFee: v })} />
          </Field>
          <Field label="USD → EUR" hint="CJ facture en dollars">
            <NumberInput value={fx.usdEur} min={0.1} max={5} onChange={(v) => updateSettings({ fx: { ...fx, usdEur: v } })} />
          </Field>
          <Field label="EUR → GBP" hint="Pour eBay UK">
            <NumberInput value={fx.eurGbp} min={0.1} max={5} onChange={(v) => updateSettings({ fx: { ...fx, eurGbp: v } })} />
          </Field>
          <div className="col-span-2">
            <Field label="Alerte si marge nette sous (%)" hint="Les annonces sous ce seuil sont signalées dans Mes Listings et le Dashboard.">
              <NumberInput value={pricing.alertThresholdPct} min={0} max={1000} onChange={(v) => set({ alertThresholdPct: v })} />
            </Field>
          </div>
        </div>

        <Row icon={<Settings2 className="size-5" />} title="Ajustement automatique" hint={`Marge relevée si demande ≥ ${DEMAND_HIGH} ventes/mois et ≤ ${SELLERS_LOW} vendeurs, réduite à ≥ ${SELLERS_HIGH} vendeurs.`}>
          <Toggle checked={pricing.autoAdjust} onChange={(v) => set({ autoAdjust: v })} label="Ajustement automatique de la marge" />
        </Row>

        <div className="border-t border-gray-100 p-5">
          <Button variant="ghost" size="sm" icon={<RotateCcw className="size-4" />} onClick={() => updateSettings({ pricing: DEFAULT_PRICING })}>
            Rétablir les valeurs par défaut
          </Button>
        </div>
      </Card>

      <Simulator pricing={pricing} />
    </Section>
  );
}

function Simulator({ pricing }: { pricing: PricingSettings }) {
  const [cost, setCost] = useState(9.99);
  const [shipping, setShipping] = useState(0);
  const [sold, setSold] = useState(500);
  const [sellers, setSellers] = useState(10);
  const r = computePrice({ cjCost: cost, shipping, signal: { sold30d: sold, sellers } }, pricing);

  return (
    <Card className="mt-4 p-5">
      <p className="text-[17px] font-bold">Simulateur de prix</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Coût CJ (€)">
          <NumberInput value={cost} min={0} onChange={setCost} />
        </Field>
        <Field label="Livraison (€)">
          <NumberInput value={shipping} min={0} onChange={setShipping} />
        </Field>
        <Field label="Ventes / 30 j">
          <NumberInput value={sold} min={0} onChange={(v) => setSold(Math.round(v))} />
        </Field>
        <Field label="Vendeurs">
          <NumberInput value={sellers} min={0} onChange={(v) => setSellers(Math.round(v))} />
        </Field>
      </div>

      <div className="mt-5 rounded-2xl bg-brand-50 p-4">
        <p className="text-sm font-semibold text-brand-700">Prix de vente eBay</p>
        <p className="text-4xl font-extrabold tabular-nums">{money(r.price)}</p>
        <dl className="mt-4 space-y-1.5 text-[15px]">
          {[
            ["Coût total (CJ + port + frais fixes)", money(r.totalCost)],
            ["Marge de base (palier)", pct(r.baseMarginPct, 0)],
            [`Ajustement : ${r.adjustment.reason}`, `× ${r.adjustment.factor.toFixed(2).replace(".", ",")}`],
            ["Marge appliquée", pct(r.appliedMarginPct, 0)],
            ["Frais eBay", money(r.ebayFee)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="text-muted">{k}</dt>
              <dd className="shrink-0 font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 border-t border-brand-200 pt-2 text-base">
            <dt className="font-bold">Marge nette</dt>
            <dd className={cn("font-extrabold tabular-nums", r.belowThreshold && "text-warn")}>
              {signedMoney(r.netProfit)} ({pct(r.netMarginPct, 0)})
            </dd>
          </div>
        </dl>
        {r.belowThreshold && (
          <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-[#b86e0f]">
            <AlertTriangle className="size-4" /> Sous votre seuil d&apos;alerte
          </p>
        )}
      </div>
    </Card>
  );
}

/* ───────── Synchro ───────── */

function Sync({ sync }: { sync: Settings["sync"] }) {
  const set = (patch: Partial<Settings["sync"]>) => updateSettings({ sync: { ...sync, ...patch } });
  return (
    <Section id="synchro" title="Synchronisation CJ">
      <Card>
        <Row icon={<RotateCcw className="size-5" />} title="Fréquence" hint="Synchro des prix et stocks CJ" stack>
          <Select
            value={String(sync.everyHours)}
            onChange={(v) => set({ everyHours: Number(v) })}
            options={[1, 3, 6, 12, 24].map((h) => ({ value: String(h), label: h === 1 ? "Toutes les heures" : `Toutes les ${h} heures` }))}
            aria-label="Fréquence de synchronisation"
          />
        </Row>
        <Row icon={<Hash className="size-5" />} title="Synchroniser les prix" hint="Recalcule le prix eBay quand le coût CJ change">
          <Toggle checked={sync.syncPrices} onChange={(v) => set({ syncPrices: v })} label="Synchroniser les prix" />
        </Row>
        <Row icon={<ShoppingCart className="size-5" />} title="Synchroniser les stocks" hint="Met à jour la quantité disponible sur eBay">
          <Toggle checked={sync.syncStock} onChange={(v) => set({ syncStock: v })} label="Synchroniser les stocks" />
        </Row>
        <Row icon={<AlertTriangle className="size-5" />} title="Pause automatique" hint="Met l'annonce en pause si le produit est en rupture">
          <Toggle checked={sync.autoPause} onChange={(v) => set({ autoPause: v })} label="Pause automatique en cas de rupture" />
        </Row>
      </Card>
    </Section>
  );
}

/* ───────── Auto-Order ───────── */

function AutoOrder({ autoOrder }: { autoOrder: Settings["autoOrder"] }) {
  const set = (patch: Partial<Settings["autoOrder"]>) => updateSettings({ autoOrder: { ...autoOrder, ...patch } });
  return (
    <Section id="auto-order" title="Auto-Order">
      <Card>
        <Row icon={<ShoppingCart className="size-5 text-brand-500" />} title="Mode Auto-Order" hint="Les commandes sont passées automatiquement chez CJ">
          <Toggle checked={autoOrder.enabled} onChange={(v) => set({ enabled: v })} label="Mode Auto-Order" />
        </Row>
        <Row icon={<Hash className="size-5" />} title="Max commandes/jour" hint="Limite de sécurité quotidienne">
          <NumberInput className="w-24 text-center" value={autoOrder.maxPerDay} min={1} max={1000} onChange={(v) => set({ maxPerDay: Math.round(v) })} aria-label="Maximum de commandes par jour" />
        </Row>
        <Row icon={<Hash className="size-5" />} title="Plafond de dépense/jour" hint="Au-delà, les ventes sont reportées au lendemain (en €)">
          <NumberInput className="w-28 text-center" value={autoOrder.maxDailySpend} min={1} max={100000} onChange={(v) => set({ maxDailySpend: v })} aria-label="Plafond de dépense journalier en euros" />
        </Row>
        <Row icon={<AlertTriangle className="size-5" />} title="Validation manuelle au-dessus de" hint="La commande CJ est créée mais NON payée : vous validez dans CJ (en €)">
          <NumberInput className="w-28 text-center" value={autoOrder.approveAbove} min={0} max={100000} onChange={(v) => set({ approveAbove: v })} aria-label="Seuil de validation manuelle en euros" />
        </Row>
        <Row icon={<Settings2 className="size-5" />} title="Mode de commande CJ" hint={autoOrder.mode === "api" ? "L'API CJ passe et paie la commande" : "Vous validez chaque commande à la main"} stack>
          <Select
            value={autoOrder.mode}
            onChange={(v) => set({ mode: v as "api" | "manual" })}
            options={[
              { value: "api", label: "API CJ (automatique)" },
              { value: "manual", label: "Manuel (validation)" },
            ]}
            aria-label="Mode de commande"
          />
        </Row>
        <Row icon={<Bell className="size-5" />} title="Notifier sur commande" hint="Recevoir une notification à chaque commande">
          <Toggle checked={autoOrder.notifyOrder} onChange={(v) => set({ notifyOrder: v })} label="Notifier sur commande" />
        </Row>
        <Row icon={<AlertTriangle className="size-5" />} title="Notifier sur erreur" hint="Alerte si une commande échoue">
          <Toggle checked={autoOrder.notifyError} onChange={(v) => set({ notifyError: v })} label="Notifier sur erreur" />
        </Row>
      </Card>
    </Section>
  );
}

/* ───────── Zone sensible ───────── */

function DangerZone() {
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const ok = confirm.trim().toUpperCase() === "SUPPRIMER";

  return (
    <Section id="zone-sensible" title="Zone sensible">
      <Card className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[17px] font-bold leading-snug">Supprimer définitivement le compte</p>
            <p className="mt-1 text-[15px] text-muted">Cette action est irréversible. Toutes vos données seront supprimées.</p>
          </div>
          <button className="shrink-0 rounded-xl px-2 py-2 text-lg font-bold text-danger hover:bg-red-50" onClick={() => setOpen(true)}>
            Supprimer
          </button>
        </div>
      </Card>

      <Sheet open={open} onClose={() => { setOpen(false); setConfirm(""); }} title="Supprimer le compte ?">
        <p className="text-muted">Vos connexions eBay et CJ, vos annonces et vos réglages seront supprimés. Tapez <strong className="text-ink">SUPPRIMER</strong> pour confirmer.</p>
        <div className="mt-4">
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="SUPPRIMER" autoCapitalize="characters" aria-label="Confirmation" />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => { setOpen(false); setConfirm(""); }}>
            Annuler
          </Button>
          <Button
            variant="danger"
            disabled={!ok}
            icon={<Trash2 className="size-5" />}
            onClick={async () => {
              if (!LIVE) {
                setOpen(false);
                setConfirm("");
                toast("Démo : aucune donnée supprimée", "warn");
                return;
              }
              try {
                await api("/api/account", { confirm: "SUPPRIMER" }, "DELETE");
                router.replace("/login");
                router.refresh();
              } catch (e) {
                toast(e instanceof Error ? e.message : "Erreur", "warn");
              }
            }}
          >
            Supprimer
          </Button>
        </div>
      </Sheet>
    </Section>
  );
}

"use client";

import { useState } from "react";
import { Check, Copy, Sparkles } from "lucide-react";
import { Button, Card, Field, Input, Notice, PageHeader, SectionLabel, Select, UsageBar, useFakeAction, useToast } from "@/components/ui";
import { buildTitles, EBAY_TITLE_MAX, type Lang } from "@/lib/generators";
import { PLANS } from "@/lib/plans";
import { LIVE } from "@/lib/mode";
import { setUsage, updateSettings, useSettings } from "@/lib/settings-store";
import { api } from "@/lib/use-api";
import { cn } from "@/lib/cn";

const LANGS = [
  { value: "fr", label: "Français (eBay France)" },
  { value: "de", label: "Allemand (eBay Allemagne)" },
  { value: "en", label: "Anglais (eBay UK)" },
];

export function TitleBuilderView({ initialProduct, initialKeywords }: { initialProduct: string; initialKeywords: string }) {
  const { plan, usage } = useSettings();
  const toast = useToast();
  const max = PLANS[plan].quotas.generations;
  const reached = usage.generations >= max;

  const [product, setProduct] = useState(initialProduct);
  const [keywords, setKeywords] = useState(initialKeywords);
  const [brand, setBrand] = useState("");
  const [lang, setLang] = useState<Lang>("fr");
  const [titles, setTitles] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [fakeBusy, run] = useFakeAction(800);
  const [liveBusy, setLiveBusy] = useState(false);
  const [usedAi, setUsedAi] = useState<boolean | null>(null);
  const busy = fakeBusy || liveBusy;

  async function generateLive() {
    setLiveBusy(true);
    try {
      const r = await api<{ titles: string[]; ai: boolean; usage: Parameters<typeof setUsage>[0] }>("/api/generate", { kind: "title", product, keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean), brand, lang });
      setTitles(r.titles);
      setUsedAi(r.ai);
      setUsage(r.usage);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erreur de génération", "warn");
    } finally {
      setLiveBusy(false);
    }
  }

  function generate() {
    if (LIVE) return void generateLive();
    run(() => {
      setTitles(buildTitles({ product: product.trim(), keywords: keywords.split(",").map((k) => k.trim()), brand: brand.trim(), lang }));
      updateSettings((s) => ({ usage: { ...s.usage, generations: s.usage.generations + 1 } }));
    });
  }

  async function copy(title: string) {
    try {
      await navigator.clipboard.writeText(title);
      setCopied(title);
      setTimeout(() => setCopied((c) => (c === title ? null : c)), 1800);
    } catch {
      toast("Copie impossible : sélectionnez le titre manuellement", "warn");
    }
  }

  return (
    <>
      <PageHeader title="Title Builder" subtitle={`Titres eBay de ${EBAY_TITLE_MAX} caractères max, optimisés SEO`} />

      <Card className="space-y-5 p-6">
        <Field label="Produit">
          <Input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Ex. Masseur lifting visage LED" />
        </Field>
        <Field label="Mots-clés SEO" hint="Séparés par des virgules. Les plus importants en premier.">
          <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="ems, rechargeable, anti-rides" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Marque (optionnel)">
            <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="—" />
          </Field>
          <Field label="Langue">
            <Select value={lang} onChange={(v) => setLang(v as Lang)} options={LANGS} />
          </Field>
        </div>
        {reached ? (
          <Button full size="lg" variant="warning" href="/profil#plans">
            Quota atteint ({usage.generations}/{max}) — Premium
          </Button>
        ) : (
          <Button full size="lg" loading={busy} disabled={product.trim().length < 2} icon={<Sparkles className="size-5" />} onClick={generate}>
            Générer les titres
          </Button>
        )}
      </Card>

      {titles.length > 0 && (
        <section className="mt-6 space-y-3" aria-label="Titres générés">
          <SectionLabel>Propositions</SectionLabel>
          {titles.map((t) => {
            const over = t.length > EBAY_TITLE_MAX;
            return (
              <Card key={t} className="p-4">
                <p className="text-[17px] font-semibold leading-snug">{t}</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className={cn("text-sm font-bold tabular-nums", over ? "text-danger" : t.length >= 70 ? "text-[#15803d]" : "text-muted")}>
                    {t.length}/{EBAY_TITLE_MAX}
                  </span>
                  <Button size="sm" variant="secondary" icon={copied === t ? <Check className="size-4 text-ok" /> : <Copy className="size-4" />} onClick={() => copy(t)}>
                    {copied === t ? "Copié" : "Copier"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </section>
      )}

      <div className="mt-6 space-y-3">
        {LIVE ? (
          usedAi === false && <Notice>Gabarits locaux utilisés : ajoutez ANTHROPIC_API_KEY côté serveur pour la génération par IA.</Notice>
        ) : (
          <Notice>Mode démo : gabarits locaux. L&apos;IA s&apos;active avec la clé API côté serveur.</Notice>
        )}
        <Card className="p-5">
          <UsageBar label="Générations aujourd'hui" used={usage.generations} max={max} />
        </Card>
      </div>
    </>
  );
}

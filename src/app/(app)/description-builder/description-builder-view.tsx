"use client";

import { useState } from "react";
import { Check, Code2, Copy, Sparkles } from "lucide-react";
import { Button, Card, Field, Input, Notice, PageHeader, SectionLabel, Segmented, Select, TextArea, UsageBar, useFakeAction, useToast } from "@/components/ui";
import { buildDescription, type Lang, type Tone } from "@/lib/generators";
import { PLANS } from "@/lib/plans";
import { LIVE } from "@/lib/mode";
import { setUsage, updateSettings, useSettings } from "@/lib/settings-store";
import { api } from "@/lib/use-api";

const LANGS = [
  { value: "fr", label: "Français" },
  { value: "de", label: "Allemand" },
  { value: "en", label: "Anglais" },
];

export function DescriptionBuilderView() {
  const { plan, usage } = useSettings();
  const toast = useToast();
  const max = PLANS[plan].quotas.generations;
  const reached = usage.generations >= max;

  const [product, setProduct] = useState("");
  const [features, setFeatures] = useState("");
  const [tone, setTone] = useState<Tone>("pro");
  const [lang, setLang] = useState<Lang>("fr");
  const [result, setResult] = useState<{ text: string; html: string } | null>(null);
  const [showHtml, setShowHtml] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fakeBusy, run] = useFakeAction(900);
  const [liveBusy, setLiveBusy] = useState(false);
  const [usedAi, setUsedAi] = useState<boolean | null>(null);
  const busy = fakeBusy || liveBusy;

  async function generateLive() {
    setLiveBusy(true);
    try {
      const r = await api<{ text: string; html: string; ai: boolean; usage: Parameters<typeof setUsage>[0] }>("/api/generate", { kind: "description", product, features: features.split("\n").map((f) => f.trim()).filter(Boolean), tone, lang });
      setResult({ text: r.text, html: r.html });
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
      setResult(buildDescription({ product: product.trim(), features: features.split("\n").map((f) => f.trim()).filter(Boolean), tone, lang }));
      updateSettings((s) => ({ usage: { ...s.usage, generations: s.usage.generations + 1 } }));
    });
  }

  async function copy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(showHtml ? result.html : result.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast("Copie impossible : sélectionnez le texte manuellement", "warn");
    }
  }

  return (
    <>
      <PageHeader title="Description Builder" subtitle="Descriptions eBay claires, prêtes à publier" />

      <Card className="space-y-5 p-6">
        <Field label="Produit">
          <Input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Ex. Lampe frontale LED rechargeable" />
        </Field>
        <Field label="Caractéristiques" hint="Une par ligne. Indiquez uniquement ce que le produit fait réellement.">
          <TextArea value={features} onChange={(e) => setFeatures(e.target.value)} placeholder={"Batterie USB-C 1200 mAh\n3 modes d'éclairage\nÉtanche IPX4"} rows={5} />
        </Field>
        <div>
          <span className="mb-2 block text-[15px] font-semibold">Ton</span>
          <Segmented
            value={tone}
            onChange={setTone}
            options={[
              { value: "pro", label: "Pro" },
              { value: "warm", label: "Chaleureux" },
              { value: "short", label: "Concis" },
            ]}
          />
        </div>
        <Field label="Langue">
          <Select value={lang} onChange={(v) => setLang(v as Lang)} options={LANGS} />
        </Field>
        {reached ? (
          <Button full size="lg" variant="warning" href="/profil#plans">
            Quota atteint ({usage.generations}/{max}) — Premium
          </Button>
        ) : (
          <Button full size="lg" loading={busy} disabled={product.trim().length < 2} icon={<Sparkles className="size-5" />} onClick={generate}>
            Générer la description
          </Button>
        )}
      </Card>

      {result && (
        <Card className="mt-6 p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <SectionLabel>Aperçu</SectionLabel>
            <Button size="sm" variant="ghost" icon={<Code2 className="size-4" />} onClick={() => setShowHtml((v) => !v)}>
              {showHtml ? "Texte" : "HTML"}
            </Button>
          </div>
          <pre className="whitespace-pre-wrap break-words rounded-2xl bg-gray-50 p-4 font-sans text-[15px] leading-relaxed">{showHtml ? result.html : result.text}</pre>
          <Button full variant="secondary" className="mt-4" icon={copied ? <Check className="size-5 text-ok" /> : <Copy className="size-5" />} onClick={copy}>
            {copied ? "Copié" : showHtml ? "Copier le HTML" : "Copier le texte"}
          </Button>
        </Card>
      )}

      <div className="mt-6 space-y-3">
        <Notice>
          {LIVE ? (usedAi === false ? "Gabarits locaux utilisés (ANTHROPIC_API_KEY absente côté serveur). " : "") : "Mode démo : gabarits locaux. "}
          Relisez la section livraison : elle doit refléter vos vrais délais.
        </Notice>
        <Card className="p-5">
          <UsageBar label="Générations aujourd'hui" used={usage.generations} max={max} />
        </Card>
      </div>
    </>
  );
}

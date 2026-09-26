"use client";

import { useState } from "react";
import { Check, Copy, Info, Sparkles } from "lucide-react";
import { Button, Card, Field, Input, Notice, PageHeader, Select, TextArea, useToast } from "@/components/ui";
import { PLANS } from "@/lib/plans";
import { LIVE } from "@/lib/mode";
import { setUsage, useSettings } from "@/lib/settings-store";
import { api } from "@/lib/use-api";

const LANGS = [
  { value: "fr", label: "Français" },
  { value: "de", label: "Allemand" },
  { value: "en", label: "Anglais" },
];
const CONDITIONS = [
  { value: "new_tag", label: "Neuf avec étiquette" },
  { value: "new", label: "Neuf sans étiquette" },
  { value: "very_good", label: "Très bon état" },
  { value: "good", label: "Bon état" },
  { value: "fair", label: "État correct" },
];

type Draft = { title: string; description: string; keywords: string[]; ai: boolean };

export function VintedView() {
  const { plan, usage } = useSettings();
  const toast = useToast();
  const max = PLANS[plan].quotas.generations;
  const [product, setProduct] = useState("");
  const [details, setDetails] = useState("");
  const [condition, setCondition] = useState("very_good");
  const [lang, setLang] = useState("fr");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    try {
      const r = await api<Draft & { usage: Parameters<typeof setUsage>[0] }>("/api/generate", { kind: "vinted", product: product.trim(), details: details.trim(), condition, lang });
      setDraft(r);
      setUsage(r.usage);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erreur de génération", "warn");
    } finally {
      setBusy(false);
    }
  }

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
    } catch {
      toast("Copie impossible : sélectionnez le texte manuellement", "warn");
    }
  }

  const copyBtn = (id: string, text: string) => (
    <Button size="sm" variant="secondary" icon={copied === id ? <Check className="size-4 text-ok" /> : <Copy className="size-4" />} onClick={() => copy(id, text)}>
      {copied === id ? "Copié" : "Copier"}
    </Button>
  );

  if (!LIVE) {
    return (
      <>
        <PageHeader title="Vinted" subtitle="Assistant de rédaction d'annonces Vinted" />
        <Notice>Disponible avec votre compte connecté.</Notice>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Vinted" subtitle="Rédige titre, description et mots-clés au format Vinted, à copier dans l'appli" />

      <div className="mb-4">
        <Notice icon={<Info className="size-5" />}>
          Assistant manuel : DropFlow n&apos;est pas connecté à Vinted (pas d&apos;accès API pour les particuliers). Vous publiez vous-même dans l&apos;appli Vinted, avec des articles que vous possédez.
        </Notice>
      </div>

      <Card className="space-y-5 p-6">
        <Field label="Article">
          <Input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Ex. Veste en jean Levi's taille M" />
        </Field>
        <Field label="Détails réels" hint="Taille, mesures, défauts, marque... Seules ces infos seront utilisées, rien n'est inventé.">
          <TextArea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Ex. Portée deux fois, aucun défaut, longueur 62 cm" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="État">
            <Select value={condition} onChange={setCondition} options={CONDITIONS} />
          </Field>
          <Field label="Langue">
            <Select value={lang} onChange={setLang} options={LANGS} />
          </Field>
        </div>
        <Button full size="lg" loading={busy} disabled={product.trim().length < 2 || usage.generations >= max} icon={<Sparkles className="size-5" />} onClick={generate}>
          {usage.generations >= max ? `Quota atteint (${usage.generations}/${max})` : "Rédiger l'annonce"}
        </Button>
      </Card>

      {draft && (
        <section className="mt-6 space-y-3" aria-label="Annonce générée">
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Titre ({draft.title.length}/60)</p>
            <p className="mt-1 text-[17px] font-semibold leading-snug">{draft.title}</p>
            <div className="mt-3 flex justify-end">{copyBtn("title", draft.title)}</div>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Description</p>
            <p className="mt-1 whitespace-pre-line text-[16px] leading-snug">{draft.description}</p>
            <div className="mt-3 flex justify-end">{copyBtn("desc", draft.description)}</div>
          </Card>
          {draft.keywords.length > 0 && (
            <Card className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Mots-clés</p>
              <p className="mt-1 text-[16px]">{draft.keywords.join(", ")}</p>
              <div className="mt-3 flex justify-end">{copyBtn("kw", draft.keywords.join(", "))}</div>
            </Card>
          )}
          {!draft.ai && <Notice>Gabarit simple utilisé : la rédaction par IA n&apos;était pas disponible.</Notice>}
        </section>
      )}
    </>
  );
}

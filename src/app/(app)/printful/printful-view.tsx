"use client";

import { useState } from "react";
import { AlertTriangle, ImagePlus, Sparkles } from "lucide-react";
import { Button, Card, Field, Input, Notice, NumberInput, PageHeader, ProductThumb, Select, Segmented, useToast } from "@/components/ui";
import { COUNTRIES } from "@/lib/demo-data";
import { LIVE } from "@/lib/mode";
import { useSettings, type CountryCode } from "@/lib/settings-store";
import { api, useApi } from "@/lib/use-api";

type CatalogProduct = { id: number; name: string; type: string };
type CatalogVariant = { id: number; name: string; size?: string; color?: string };

export function PrintfulView() {
  const { printful } = useSettings();
  const toast = useToast();
  const [market, setMarket] = useState<CountryCode>("fr");
  const [productId, setProductId] = useState<number | null>(null);
  const [variantId, setVariantId] = useState<number | null>(null);
  const [prompt, setPrompt] = useState("");
  const [price, setPrice] = useState(24.99);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ title: string; image: string } | null>(null);

  const catalog = useApi<{ products: CatalogProduct[] }>("/api/printful/catalog", LIVE && printful.connected);
  const variants = useApi<{ variants: CatalogVariant[] }>(productId ? `/api/printful/catalog?productId=${productId}` : "", LIVE && printful.connected && productId !== null);

  const product = catalog.data?.products.find((p) => p.id === productId);

  async function publish() {
    if (!productId || !variantId || prompt.trim().length < 3) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await api<{ title: string; price: number; ebayListingId: string; image: string }>("/api/printful/publish", {
        market,
        catalogProductName: product?.name ?? "Produit Printful",
        catalogVariantId: variantId,
        designPrompt: prompt.trim(),
        retailPrice: price,
      });
      setResult({ title: r.title, image: r.image });
      toast("Annonce publiée sur eBay");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erreur", "warn");
    } finally {
      setBusy(false);
    }
  }

  if (!LIVE || !printful.connected) {
    return (
      <>
        <PageHeader title="Printful" subtitle="Impression à la demande : visuel généré par IA sur un produit du catalogue Printful" />
        <Notice icon={<AlertTriangle className="size-5" />}>Connectez Printful dans Paramètres → Connexions pour utiliser cette page.</Notice>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Printful" subtitle="Un visuel généré par IA, appliqué sur un produit du catalogue, publié directement sur eBay" />

      <Card className="space-y-5 p-6">
        <Field label="Marché eBay">
          <Segmented value={market} onChange={setMarket} options={COUNTRIES.map((c) => ({ value: c.code, label: `${c.flag} ${c.name === "Royaume-Uni" ? "UK" : c.name}` }))} />
        </Field>

        <Field label="Produit catalogue Printful">
          <Select
            value={productId?.toString() ?? ""}
            onChange={(v) => {
              setProductId(Number(v));
              setVariantId(null);
            }}
            options={[{ value: "", label: catalog.loading ? "Chargement…" : "Choisir un produit" }, ...(catalog.data?.products ?? []).map((p) => ({ value: p.id.toString(), label: p.name }))]}
          />
        </Field>

        {productId && (
          <Field label="Variante (taille / couleur)">
            <Select
              value={variantId?.toString() ?? ""}
              onChange={(v) => setVariantId(Number(v))}
              options={[{ value: "", label: variants.loading ? "Chargement…" : "Choisir une variante" }, ...(variants.data?.variants ?? []).map((v) => ({ value: v.id.toString(), label: v.name }))]}
            />
          </Field>
        )}

        <Field label="Thème du visuel" hint="Décrivez ce que l'IA doit dessiner. Coût réel par génération (voir Paramètres).">
          <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ex. renard minimaliste style aquarelle" />
        </Field>

        <Field label="Prix de vente">
          <NumberInput value={price} min={1} step={0.5} onChange={setPrice} />
        </Field>

        <Button full size="lg" loading={busy} disabled={!productId || !variantId || prompt.trim().length < 3} icon={<Sparkles className="size-5" />} onClick={publish}>
          Générer le visuel et publier
        </Button>
      </Card>

      {result && (
        <Card className="mt-6 flex items-center gap-4 p-5">
          <ProductThumb image={result.image} />
          <div className="min-w-0">
            <p className="font-bold leading-snug">{result.title}</p>
            <p className="text-sm text-muted">Publiée sur eBay {COUNTRIES.find((c) => c.code === market)?.name}</p>
          </div>
        </Card>
      )}

      <div className="mt-6">
        <Notice icon={<ImagePlus className="size-5" />}>
          Le suivi de commande et l&apos;expédition sont gérés automatiquement par Printful dès qu&apos;une vente arrive — pas encore de garde-fou de risque (plafond, marge) comme pour CJ sur ce fournisseur.
        </Notice>
      </div>
    </>
  );
}

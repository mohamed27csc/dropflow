"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Package, Truck } from "lucide-react";
import { Card, Notice, PageHeader, Segmented, StatusDot } from "@/components/ui";
import { COUNTRIES } from "@/lib/demo-data";
import { money } from "@/lib/format";
import { LIVE } from "@/lib/mode";
import { useApi } from "@/lib/use-api";

type Order = {
  id: string;
  market: string;
  ebayOrderId: string;
  title: string | null;
  status: "pending" | "ordered" | "awaiting_payment" | "shipped" | "tracking_sent" | "error" | "blocked";
  trackingNumber: string | null;
  trackingCarrier: string | null;
  buyer: string | null;
  total: number | null;
  currency: string | null;
  error: string | null;
  createdAt: string;
};

const STAGES: { key: Order["status"]; label: string }[] = [
  { key: "pending", label: "Vente reçue" },
  { key: "ordered", label: "Commandée chez CJ" },
  { key: "shipped", label: "Expédiée" },
  { key: "tracking_sent", label: "Suivi envoyé" },
];

const STATUS_TONE: Record<Order["status"], "brand" | "warn" | "off" | "ok"> = {
  pending: "off",
  ordered: "brand",
  awaiting_payment: "warn",
  shipped: "brand",
  tracking_sent: "ok",
  error: "warn",
  blocked: "warn",
};

const STATUS_LABEL: Record<Order["status"], string> = {
  pending: "En cours de traitement",
  ordered: "Commandée chez le fournisseur",
  awaiting_payment: "À valider et payer dans CJ",
  shipped: "Expédiée",
  tracking_sent: "Livrée en cours (suivi envoyé)",
  error: "Erreur — nouvelle tentative automatique",
  blocked: "Bloquée — action nécessaire",
};

function Timeline({ status }: { status: Order["status"] }) {
  if (status === "blocked" || status === "error" || status === "awaiting_payment") return null;
  const idx = STAGES.findIndex((s) => s.key === status);
  return (
    <div className="mt-3 flex items-center gap-1">
      {STAGES.map((s, i) => (
        <div key={s.key} className="flex flex-1 items-center gap-1">
          <div className={`h-1.5 flex-1 rounded-full ${i <= idx ? "bg-brand-400" : "bg-gray-100"}`} />
        </div>
      ))}
    </div>
  );
}

export function VentesView() {
  const { data } = useApi<{ orders: Order[] }>("/api/orders", LIVE);
  const [filter, setFilter] = useState<"all" | "issues">("all");
  const filtered = useMemo(() => (data?.orders ?? []).filter((o) => filter === "all" || o.status === "error" || o.status === "blocked" || o.status === "awaiting_payment"), [data, filter]);
  const flag = (m: string) => COUNTRIES.find((c) => c.code === m)?.flag ?? "";

  if (!LIVE) {
    return (
      <>
        <PageHeader title="Ventes" subtitle="Suivi de chaque commande, de l'achat sur eBay jusqu'au numéro de suivi." />
        <Notice icon={<AlertTriangle className="size-5" />}>Cette page affiche vos vraies commandes. Connectez eBay et CJ pour l&apos;utiliser.</Notice>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Ventes" subtitle="Suivi de chaque commande, de l'achat sur eBay jusqu'au numéro de suivi." />

      <Segmented value={filter} onChange={setFilter} options={[{ value: "all", label: "Toutes" }, { value: "issues", label: "À vérifier" }]} />

      <div className="mt-4 space-y-3">
        {!filtered.length && <p className="py-8 text-center text-muted">{filter === "issues" ? "Aucune commande à vérifier." : "Aucune vente pour l'instant."}</p>}
        {filtered.map((o) => (
          <Card key={o.id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-bold">
                  {flag(o.market)} {o.title ?? o.ebayOrderId}
                </p>
                <p className="text-sm text-muted">
                  {o.buyer ?? "Acheteur inconnu"} · {new Date(o.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                </p>
              </div>
              {o.total !== null && <p className="shrink-0 font-extrabold tabular-nums">{money(o.total, (o.currency as "EUR" | "GBP") ?? "EUR")}</p>}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusDot tone={STATUS_TONE[o.status]}>{STATUS_LABEL[o.status]}</StatusDot>
            </div>
            <Timeline status={o.status} />

            {o.trackingNumber && (
              <p className="mt-3 flex items-center gap-2 text-sm font-medium text-brand-600">
                <Truck className="size-4" /> {o.trackingNumber}
                {o.trackingCarrier && ` (${o.trackingCarrier})`}
              </p>
            )}
            {o.error && (
              <p className="mt-3 flex items-start gap-2 text-sm font-medium text-[#b86e0f]">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {o.error}
              </p>
            )}
            {o.status === "pending" && (
              <p className="mt-3 flex items-center gap-2 text-sm text-muted">
                <Package className="size-4" /> Traitement en cours, revenez dans quelques minutes.
              </p>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}

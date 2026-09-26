"use client";

import { useState } from "react";
import { AlertTriangle, Send } from "lucide-react";
import { Button, Card, Notice, PageHeader, Segmented, StatusDot, TextArea, useToast } from "@/components/ui";
import { LIVE } from "@/lib/mode";
import { api, useApi } from "@/lib/use-api";

type BuyerMessage = { id: string; market: string; item_id: string; item_title: string | null; buyer: string; question: string; reply: string | null; status: "pending" | "auto_replied" | "escalated" | "manual_replied"; created_at: string };

const STATUS_LABEL: Record<BuyerMessage["status"], string> = {
  pending: "En attente",
  auto_replied: "Répondu automatiquement",
  escalated: "À traiter vous-même",
  manual_replied: "Répondu manuellement",
};

export function MessagesView() {
  const toast = useToast();
  const { data, reload } = useApi<{ messages: BuyerMessage[] }>("/api/messages", LIVE);
  const [filter, setFilter] = useState<"all" | "escalated">("all");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);

  const messages = (data?.messages ?? []).filter((m) => filter === "all" || m.status === "escalated");

  async function send(id: string) {
    const text = drafts[id]?.trim();
    if (!text) return;
    setSending(id);
    try {
      await api("/api/messages/reply", { id, text });
      toast("Réponse envoyée");
      setDrafts((d) => ({ ...d, [id]: "" }));
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erreur", "warn");
    } finally {
      setSending(null);
    }
  }

  if (!LIVE) {
    return (
      <>
        <PageHeader title="Messages" subtitle="Réponses automatiques aux acheteurs eBay" />
        <Notice icon={<AlertTriangle className="size-5" />}>Cette fonctionnalité concerne votre compte eBay réel. Connectez eBay pour l&apos;utiliser.</Notice>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Messages" subtitle="L'IA répond automatiquement aux questions sur vos annonces DropFlow. Les messages qui ressemblent à un litige vous sont signalés ici." />

      <Segmented value={filter} onChange={setFilter} options={[{ value: "all", label: "Tous" }, { value: "escalated", label: "À traiter" }]} />

      <div className="mt-4 space-y-3">
        {!messages.length && <p className="py-8 text-center text-muted">Aucun message pour l&apos;instant.</p>}
        {messages.map((m) => (
          <Card key={m.id} className="p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold">{m.buyer}</p>
              <StatusDot tone={m.status === "escalated" ? "warn" : m.status === "pending" ? "off" : "ok"}>{STATUS_LABEL[m.status]}</StatusDot>
            </div>
            {m.item_title && <p className="mt-0.5 text-sm text-muted">{m.item_title}</p>}
            <p className="mt-3 rounded-2xl bg-gray-50 p-3 text-[15px]">{m.question}</p>
            {m.reply && (
              <div className="mt-2 rounded-2xl bg-brand-50 p-3 text-[15px]">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-500">Votre réponse</p>
                <p className="mt-1">{m.reply}</p>
              </div>
            )}
            {m.status !== "manual_replied" && (
              <div className="mt-3 flex items-end gap-2">
                <TextArea rows={2} className="flex-1" placeholder="Répondre directement…" value={drafts[m.id] ?? ""} onChange={(e) => setDrafts((d) => ({ ...d, [m.id]: e.target.value }))} />
                <Button size="md" icon={<Send className="size-4" />} loading={sending === m.id} onClick={() => send(m.id)}>
                  Envoyer
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}

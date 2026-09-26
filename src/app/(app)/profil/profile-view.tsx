"use client";

import { useState } from "react";
import { Check, Crown, RotateCcw } from "lucide-react";
import { SecurityCard } from "./security-card";
import { Badge, Button, Card, Field, Input, PageHeader, SectionLabel, UsageBar, useToast } from "@/components/ui";
import { PLANS, type PlanId } from "@/lib/plans";
import { LIVE } from "@/lib/mode";
import { resetSettings, updateSettings, useSettings } from "@/lib/settings-store";
import { cn } from "@/lib/cn";

const FEATURES: Record<PlanId, (q: (typeof PLANS)[PlanId]["quotas"]) => string[]> = {
  free: (q) => [`${q.sniperRuns} lancements Sniper / jour`, `${q.sniperProducts} produits max par lancement`, `${q.analyses} analyses / jour`, `${q.generations} générations IA / jour`],
  owner: (q) => [`${q.sniperRuns} lancements Sniper / jour`, `${q.sniperProducts} produits max par lancement`, "Analyses et générations IA sans limite pratique", "Tous les accès"],
  pro: (q) => [`${q.sniperRuns} lancements Sniper / jour`, `${q.sniperProducts} produits max par lancement`, `${q.analyses} analyses / jour`, `${q.generations} générations IA / jour`, "Classements complets"],
};

export function ProfileView() {
  const { pseudo, email, plan, usage } = useSettings();
  const toast = useToast();
  const [draft, setDraft] = useState<string | null>(null);
  const quotas = PLANS[plan].quotas;
  const name = draft ?? pseudo;

  return (
    <>
      <PageHeader title="Mon Profil" />

      <Card className="p-6">
        <div className="mb-5 flex items-center gap-4">
          <span className="grid size-16 place-items-center rounded-full bg-brand-400 text-3xl font-extrabold text-white" aria-hidden>
            {pseudo.charAt(0).toUpperCase() || "?"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xl font-extrabold">{pseudo}</p>
            <p className="truncate text-muted">{email}</p>
          </div>
        </div>
        <div className="space-y-4">
          <Field label="Pseudo">
            <Input value={name} onChange={(e) => setDraft(e.target.value)} maxLength={30} />
          </Field>
          <Field label="Email">
            <Input value={email} readOnly className="bg-gray-50 text-muted" />
          </Field>
          <Button
            full
            disabled={draft === null || draft.trim().length < 2}
            onClick={() => {
              updateSettings({ pseudo: draft!.trim() });
              setDraft(null);
              toast("Profil enregistré");
            }}
          >
            Enregistrer
          </Button>
        </div>
      </Card>

      <Card className="mt-4 p-6">
        <div className="flex items-center justify-between">
          <SectionLabel>Utilisation du jour</SectionLabel>
          <Badge tone={plan === "pro" || plan === "owner" ? "pro" : "muted"}>Plan {PLANS[plan].name}</Badge>
        </div>
        <div className="mt-5 space-y-5">
          <UsageBar label="Lancements Sniper" used={usage.sniperRuns} max={quotas.sniperRuns} />
          <UsageBar label="Analyses" used={usage.analyses} max={quotas.analyses} />
          <UsageBar label="Générations IA" used={usage.generations} max={quotas.generations} />
        </div>
      </Card>

      {LIVE && <SecurityCard />}

      {plan !== "owner" && (
        <>
      <h2 id="plans" className="mb-3 mt-8 scroll-mt-24 text-xl font-extrabold">
        Plans
      </h2>
      <div className="space-y-4">
        {(["free", "pro"] as PlanId[]).map((id) => {
          const p = PLANS[id];
          const current = id === plan;
          return (
            <Card key={id} className={cn("p-6", id === "pro" && "border-warn/40")}>
              <div className="flex items-baseline justify-between">
                <h3 className="flex items-center gap-2 text-xl font-extrabold">
                  {id === "pro" && <Crown className="size-5 text-warn" aria-hidden />}
                  {p.name}
                </h3>
                <p className="font-bold text-muted">{p.price}</p>
              </div>
              <ul className="mt-4 space-y-2">
                {FEATURES[id](p.quotas).map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-[15px]">
                    <Check className="size-5 shrink-0 text-brand-500" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
              {current ? (
                <p className="mt-5 text-center text-sm font-bold text-muted">Plan actuel</p>
              ) : (
                <Button
                  full
                  variant={id === "pro" ? "warning" : "secondary"}
                  className="mt-5"
                  disabled={LIVE}
                  onClick={() => {
                    updateSettings({ plan: id });
                    toast(id === "pro" ? "Plan Pro activé (démo, sans paiement)" : "Retour au plan Free");
                  }}
                >
                  {LIVE ? "Paiement bientôt disponible" : id === "pro" ? "Passer Pro" : "Revenir à Free"}
                </Button>
              )}
            </Card>
          );
        })}
      </div>
      <p className="mt-3 text-center text-sm text-muted">Le paiement (Stripe) n&apos;est pas encore branché : le plan Pro s&apos;active pour l&apos;instant côté base de données.</p>
        </>
      )}

      {!LIVE && (
        <Button
          variant="ghost"
          full
          className="mt-8"
          icon={<RotateCcw className="size-4" />}
          onClick={() => {
            resetSettings();
            setDraft(null);
            toast("Données de démo réinitialisées");
          }}
        >
          Réinitialiser les données de démo
        </Button>
      )}
    </>
  );
}

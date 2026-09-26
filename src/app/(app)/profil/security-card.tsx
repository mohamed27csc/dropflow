"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { Button, Card, Field, Input, Notice, SectionLabel, useToast } from "@/components/ui";
import { checkPassword } from "@/lib/password";
import { api, useApi } from "@/lib/use-api";

type Factors = { factors: { id: string; status: string }[]; level: string };

/** Sécurité du compte (mode live) : 2FA TOTP, mot de passe, export RGPD, déconnexion de toutes les sessions. */
export function SecurityCard() {
  const toast = useToast();
  const router = useRouter();
  const mfa = useApi<Factors>("/api/auth/mfa", true);
  const [enroll, setEnroll] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);

  const verified = mfa.data?.factors.find((f) => f.status === "verified");

  async function run<T>(fn: () => Promise<T>, ok?: string) {
    setBusy(true);
    try {
      const r = await fn();
      if (ok) toast(ok);
      return r;
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erreur", "warn");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-4 p-6">
      <SectionLabel>Sécurité</SectionLabel>

      <div className="mt-4 flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-xl bg-gray-100 text-muted">
          <ShieldCheck className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">Vérification en deux étapes</p>
          <p className="text-[15px] text-muted">{verified ? "Activée (application TOTP)" : "Recommandée : protège vos comptes eBay et CJ"}</p>
        </div>
      </div>

      {!verified && !enroll && (
        <Button full variant="secondary" className="mt-4" loading={busy} onClick={async () => { const r = await run(() => api<{ factorId: string; qr: string; secret: string }>("/api/auth/mfa/enroll", {})); if (r) setEnroll(r); }}>
          Activer la 2FA
        </Button>
      )}
      {enroll && (
        <div className="mt-4 space-y-3">
          <p className="text-[15px] text-muted">Scannez ce QR code avec Google Authenticator, 1Password ou Authy, puis saisissez le code à 6 chiffres.</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- QR SVG en data: URL généré par Supabase */}
          <img src={enroll.qr} alt="QR code d'activation" width={180} height={180} className="mx-auto rounded-xl border border-gray-200 bg-white p-2" />
          <p className="break-all text-center font-mono text-xs text-muted">Clé manuelle : {enroll.secret}</p>
          <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" className="text-center text-xl tracking-[0.3em]" aria-label="Code à 6 chiffres" />
          <Button full loading={busy} disabled={code.length !== 6} onClick={async () => { const ok = await run(() => api("/api/auth/mfa/verify", { factorId: enroll.factorId, code }), "2FA activée"); if (ok) { setEnroll(null); setCode(""); mfa.reload(); } }}>
            Confirmer
          </Button>
        </div>
      )}
      {verified && (
        <Button full variant="danger" className="mt-4" loading={busy} onClick={async () => { if (!confirm("Désactiver la vérification en deux étapes ?")) return; const ok = await run(() => api("/api/auth/mfa", { factorId: verified.id }, "DELETE"), "2FA désactivée"); if (ok) mfa.reload(); }}>
          Désactiver la 2FA
        </Button>
      )}

      <form
        className="mt-6 space-y-3 border-t border-gray-100 pt-5"
        onSubmit={async (e) => {
          e.preventDefault();
          const weak = checkPassword(pw);
          setPwError(weak ? `Mot de passe trop faible : ${weak}` : null);
          if (weak) return;
          const ok = await run(() => api("/api/auth/password", { password: pw }), "Mot de passe modifié, autres sessions déconnectées");
          if (ok) setPw("");
        }}
      >
        <Field label="Nouveau mot de passe" hint="Les autres appareils seront déconnectés.">
          <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" maxLength={128} />
        </Field>
        {pwError && <Notice>{pwError}</Notice>}
        <Button type="submit" full variant="secondary" loading={busy} disabled={pw.length < 1} icon={<KeyRound className="size-5" />}>
          Changer le mot de passe
        </Button>
      </form>

      <div className="mt-6 space-y-3 border-t border-gray-100 pt-5">
        <Button href="/api/account/export" full variant="secondary" icon={<Download className="size-5" />}>
          Exporter mes données (JSON)
        </Button>
        <Button
          full
          variant="ghost"
          icon={<LogOut className="size-5" />}
          onClick={async () => {
            await run(() => api("/api/auth/logout", {}));
            router.replace("/login");
            router.refresh();
          }}
        >
          Se déconnecter (tous les appareils)
        </Button>
      </div>
    </Card>
  );
}

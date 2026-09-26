"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { TURNSTILE_ON, Turnstile } from "@/components/Turnstile";
import { Button, Card, Field, Input, Notice } from "@/components/ui";
import { APP_NAME } from "@/lib/brand";
import { api } from "@/lib/use-api";

type Mode = "in" | "reset";

export function LoginForm({ linkError }: { linkError: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [attempt, setAttempt] = useState(0); // remonte le Turnstile : un jeton ne sert qu'une fois
  const [mfa, setMfa] = useState<{ factorId: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    linkError ? "Lien invalide ou expiré." : null,
  );
  const [info, setInfo] = useState<string | null>(null);
  const onToken = useCallback((t: string) => setCaptcha(t), []);

  const done = () => {
    router.replace("/dashboard");
    router.refresh();
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (TURNSTILE_ON && !captcha)
      return setError("Validez la vérification anti-robot.");
    setBusy(true);
    try {
      if (mode === "in") {
        const r = await api<{ mfaRequired?: boolean; factorId?: string }>(
          "/api/auth/login",
          { email, password, captchaToken: captcha || undefined },
        );
        if (r.mfaRequired && r.factorId) setMfa({ factorId: r.factorId });
        else done();
      } else {
        setInfo(
          (
            await api<{ message: string }>("/api/auth/reset", {
              email,
              captchaToken: captcha || undefined,
            })
          ).message,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
      setCaptcha("");
      setAttempt((a) => a + 1);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api("/api/auth/mfa/verify", { factorId: mfa!.factorId, code });
      done();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Code invalide");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10 pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
      <div className="mb-8 flex items-center justify-center gap-3">
        <Logo size={52} />
        <span className="text-4xl font-extrabold tracking-tight text-brand-500">
          {APP_NAME}
        </span>
      </div>

      <Card className="space-y-5 p-6">
        {mfa ? (
          <form onSubmit={submitCode} className="space-y-4">
            <p className="text-lg font-bold">Vérification en deux étapes</p>
            <Field
              label="Code de votre application d'authentification"
              hint="6 chiffres, renouvelés toutes les 30 secondes."
            >
              <Input
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                placeholder="123456"
                className="text-center text-2xl tracking-[0.4em]"
              />
            </Field>
            {error && <Notice>{error}</Notice>}
            <Button
              type="submit"
              full
              size="lg"
              loading={busy}
              disabled={code.length !== 6}
            >
              Valider
            </Button>
          </form>
        ) : (
          <>
            <form onSubmit={submit} className="space-y-4">
              {mode === "reset" && (
                <p className="text-[15px] text-muted">
                  Saisissez votre email : si un compte existe, un lien de
                  réinitialisation vous sera envoyé.
                </p>
              )}
              <Field label="Email">
                <Input
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  autoCapitalize="none"
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              {mode !== "reset" && (
                <Field label="Mot de passe">
                  <Input
                    type="password"
                    required
                    maxLength={128}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
              )}
              <Turnstile key={`${mode}-${attempt}`} onToken={onToken} />
              {error && <Notice>{error}</Notice>}
              {info && <Notice tone="ok">{info}</Notice>}
              <Button type="submit" full size="lg" loading={busy}>
                {mode === "in" ? "Se connecter" : "Envoyer le lien"}
              </Button>
            </form>
            <button
              type="button"
              className="w-full text-center text-[15px] font-semibold text-brand-600"
              onClick={() => {
                setMode(mode === "reset" ? "in" : "reset");
                setError(null);
                setInfo(null);
              }}
            >
              {mode === "reset"
                ? "Retour à la connexion"
                : "Mot de passe oublié ?"}
            </button>
          </>
        )}
      </Card>
      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/confidentialite" className="underline">
          Politique de confidentialité
        </Link>
      </p>
    </main>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Input, Notice } from "@/components/ui";
import { checkPassword } from "@/lib/password";
import { api } from "@/lib/use-api";

/** Atteint via le lien email de réinitialisation (session de récupération déjà ouverte par /auth/callback). */
export function ResetForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const weak = checkPassword(password);
    if (weak) return setError(`Mot de passe trop faible : ${weak}`);
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/password", { password });
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <Card className="p-6">
        <h1 className="mb-4 text-2xl font-extrabold">Nouveau mot de passe</h1>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Mot de passe" hint="12 caractères minimum, avec majuscule, minuscule, chiffre et symbole.">
            <Input type="password" required maxLength={128} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {error && <Notice>{error}</Notice>}
          <Button type="submit" full size="lg" loading={busy}>
            Enregistrer
          </Button>
        </form>
      </Card>
    </main>
  );
}

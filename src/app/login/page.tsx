import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { LIVE } from "@/lib/mode";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (!LIVE) redirect("/dashboard");
  const { error } = await searchParams;
  return <LoginForm linkError={error === "link"} />;
}

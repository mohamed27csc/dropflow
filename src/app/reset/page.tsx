import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LIVE } from "@/lib/mode";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

export default function ResetPage() {
  if (!LIVE) redirect("/dashboard");
  return <ResetForm />;
}

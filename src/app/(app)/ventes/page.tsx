import type { Metadata } from "next";
import { VentesView } from "./ventes-view";

export const metadata: Metadata = { title: "Ventes" };

export default function Page() {
  return <VentesView />;
}

import type { Metadata } from "next";
import { VintedView } from "./vinted-view";

export const metadata: Metadata = { title: "Vinted" };

export default function Page() {
  return <VintedView />;
}

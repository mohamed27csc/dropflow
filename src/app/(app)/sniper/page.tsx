import type { Metadata } from "next";
import { SniperView } from "./sniper-view";

export const metadata: Metadata = { title: "Product Sniper" };

export default function Page() {
  return <SniperView />;
}

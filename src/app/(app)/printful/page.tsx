import type { Metadata } from "next";
import { PrintfulView } from "./printful-view";

export const metadata: Metadata = { title: "Printful" };

export default function Page() {
  return <PrintfulView />;
}

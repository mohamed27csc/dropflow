import type { Metadata } from "next";
import { ListingsView } from "./listings-view";

export const metadata: Metadata = { title: "Mes Listings" };

export default function Page() {
  return <ListingsView />;
}

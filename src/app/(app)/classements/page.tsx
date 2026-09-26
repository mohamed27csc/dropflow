import type { Metadata } from "next";
import { RankingsView } from "./rankings-view";

export const metadata: Metadata = { title: "Classements" };

export default function Page() {
  return <RankingsView />;
}

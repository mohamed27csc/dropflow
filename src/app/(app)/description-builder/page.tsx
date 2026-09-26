import type { Metadata } from "next";
import { DescriptionBuilderView } from "./description-builder-view";

export const metadata: Metadata = { title: "Description Builder" };

export default function Page() {
  return <DescriptionBuilderView />;
}

import type { Metadata } from "next";
import { TitleBuilderView } from "./title-builder-view";

export const metadata: Metadata = { title: "Title Builder" };

export default async function Page({ searchParams }: PageProps<"/title-builder">) {
  const { product, keywords } = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  return <TitleBuilderView initialProduct={first(product)} initialKeywords={first(keywords)} />;
}

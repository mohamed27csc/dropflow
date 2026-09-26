import type { MetadataRoute } from "next";

/** Site privé : aucun moteur de recherche ne doit l'indexer. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}

import { listingAddInput } from "@/lib/schemas";
import { audit } from "@/server/audit";
import { parseCjPid } from "@/server/cj";
import { PublicError } from "@/server/http";
import { createListingFromCj, prepareRun } from "@/server/pipeline";
import { secured } from "@/server/route";
import { loadSettings } from "@/server/settings";

export const maxDuration = 120;

export const POST = secured({ name: "listings-add", schema: listingAddInput, user: [30, 3600] }, async ({ user, input, req }) => {
  const pid = parseCjPid(input.link);
  if (!pid) throw new PublicError("Lien ou identifiant CJ non reconnu.");
  const settings = await loadSettings(user.id, user.email ?? "");
  const ctx = await prepareRun(user.id, input.market, settings);
  const listing = await createListingFromCj(ctx, { pid, listedNum: 0 });
  await audit({ userId: user.id, action: "listing.created", entity: "listing", entityId: listing.ebayListingId, meta: { market: input.market, price: listing.price, via: "manual" }, req });
  return { listing };
});

import { secured } from "@/server/route";
import { syncUser } from "@/server/sync";

export const maxDuration = 300;

/** Synchro manuelle (boutons « Mettre à jour » / « Sync complet »). 6 par 10 minutes et par utilisateur. */
export const POST = secured({ name: "sync", user: [6, 600] }, async ({ user }) => syncUser(user.id, user.email ?? "", true));

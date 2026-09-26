/**
 * Mode « live » : dès que Supabase est configuré, l'app exige une connexion et parle aux vraies API.
 * Sans variables d'environnement, elle reste en mode démo (données factices, aucun compte requis).
 */
export const LIVE = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

-- DropFlow : suivi des tendances (à coller UNE fois dans le SQL Editor de Supabase). Peut être relancé sans risque.
-- Chaque nuit, le serveur enregistre le nombre de boutiques CJ qui vendent chaque produit repéré.
-- Un produit dont ce nombre grimpe vite est un signal de tendance.

create table if not exists public.product_snapshots (
  cj_pid text not null,
  day date not null default current_date,
  name text not null,
  image_url text,
  price numeric not null,
  listed_num int not null,
  primary key (cj_pid, day)
);

create index if not exists product_snapshots_day on public.product_snapshots (day);

-- Données de marché partagées, sans donnée personnelle : lecture et écriture réservées au serveur.
alter table public.product_snapshots enable row level security;
revoke all on public.product_snapshots from anon, authenticated;

select 'OK : table product_snapshots prête' as resultat;

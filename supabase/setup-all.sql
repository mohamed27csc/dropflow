-- ═══════════════════════════════════════════════════════════════════════════
-- DropFlow : INSTALLATION COMPLÈTE EN UN SEUL COLLER (tables + tests de sécurité + nettoyage).
-- Peut être relancé sans risque. Ne contient aucun secret.
-- Résultat attendu, en bas : une ligne « OK : tables créées et isolation RLS validée ».
-- ═══════════════════════════════════════════════════════════════════════════

-- ── PARTIE 1 : tables, sécurité (RLS), journal d'audit ─────────────────────
-- DropFlow : schéma Supabase. À exécuter une fois (SQL Editor ou `supabase db push`).
-- Les tables contenant des secrets (ebay_accounts, cj_accounts) n'ont AUCUNE policy :
-- seul le serveur (clé service-role) peut y accéder, jamais le navigateur.


create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  pseudo text,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null default '{}'::jsonb,
  usage jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.margin_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  position int not null,
  up_to numeric,               -- borne haute exclusive du coût CJ (null = illimité)
  margin_pct numeric not null
);

create table if not exists public.ebay_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  market text not null check (market in ('fr', 'de', 'uk')),
  ebay_username text,
  access_token_enc text not null,
  refresh_token_enc text not null,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, market)
);

create table if not exists public.cj_accounts (
  user_id uuid primary key references auth.users on delete cascade,
  api_key_enc text not null,
  key_hint text not null,
  access_token_enc text,
  access_expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  cj_pid text not null,
  cj_vid text not null,
  title text not null,
  image_url text,
  category text,
  cj_cost numeric not null,       -- en USD, tel que facturé par CJ
  shipping numeric not null default 0,
  cj_stock int,
  listed_num int not null default 0,   -- nb de vendeurs CJ (proxy de la concurrence)
  created_at timestamptz not null default now(),
  unique (user_id, cj_pid)
);

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  product_id uuid not null references public.products on delete cascade,
  market text not null check (market in ('fr', 'de', 'uk')),
  sku text not null,
  ebay_offer_id text,
  ebay_listing_id text,
  title text not null,
  ebay_price numeric not null,
  status text not null default 'active' check (status in ('active', 'paused', 'ended', 'error')),
  pause_reason text,
  supplier_ok boolean not null default true,
  error text,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, sku)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  market text not null,
  ebay_order_id text not null,
  listing_id uuid references public.listings on delete set null,
  cj_order_id text,
  status text not null default 'pending' check (status in ('pending', 'ordered', 'awaiting_payment', 'shipped', 'tracking_sent', 'error', 'blocked')),
  est_cost numeric,                -- coût CJ estimé en EUR (plafond de dépense/jour)
  tracking_number text,
  tracking_carrier text,
  total numeric,
  currency text,
  line_items jsonb,
  error text,
  created_at timestamptz not null default now(),
  unique (user_id, ebay_order_id)
);

-- Journal d'audit (append-only côté application : aucune policy d'écriture, insertion par le serveur uniquement)
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users on delete cascade,   -- null = événement sans compte (échec de connexion, suppression de compte)
  action text not null,
  entity text,
  entity_id text,
  meta jsonb not null default '{}'::jsonb,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists audit_user_created on public.audit_log (user_id, created_at desc);

-- Profil créé automatiquement à l'inscription
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, pseudo) values (new.id, split_part(new.email, '@', 1)) on conflict do nothing;
  insert into public.settings (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.margin_rules enable row level security;
alter table public.products enable row level security;
alter table public.listings enable row level security;
alter table public.orders enable row level security;
alter table public.audit_log enable row level security;
alter table public.ebay_accounts enable row level security;   -- pas de policy : serveur uniquement
alter table public.cj_accounts enable row level security;     -- pas de policy : serveur uniquement

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for select using (id = auth.uid());
-- le plan ne se modifie pas depuis le navigateur (paiement côté serveur) : pas de policy update

drop policy if exists "own settings" on public.settings;
create policy "own settings" on public.settings for select using (user_id = auth.uid());
drop policy if exists "own margin rules" on public.margin_rules;
create policy "own margin rules" on public.margin_rules for select using (user_id = auth.uid());
drop policy if exists "own products" on public.products;
create policy "own products" on public.products for select using (user_id = auth.uid());
drop policy if exists "own listings" on public.listings;
create policy "own listings" on public.listings for select using (user_id = auth.uid());
drop policy if exists "own orders" on public.orders;
create policy "own orders" on public.orders for select using (user_id = auth.uid());

drop policy if exists "own audit" on public.audit_log;
create policy "own audit" on public.audit_log for select using (user_id = auth.uid());

-- Défense en profondeur : les tables à secrets ne sont accessibles à AUCUN rôle client, même si une policy était ajoutée par erreur.
revoke all on public.ebay_accounts from anon, authenticated;
revoke all on public.cj_accounts from anon, authenticated;
-- Le navigateur ne peut rien écrire : ni quotas (settings.usage), ni plan/rôle (profiles), ni journal. Toute écriture passe par le serveur.
revoke insert, update, delete on public.profiles, public.settings, public.margin_rules, public.products, public.listings, public.orders, public.audit_log from anon, authenticated;
revoke all on public.audit_log, public.profiles, public.settings, public.margin_rules, public.products, public.listings, public.orders from anon;

create index if not exists listings_user_status on public.listings (user_id, status);
create index if not exists orders_user_created on public.orders (user_id, created_at desc);


-- ── PARTIE 2 : test de sécurité (deux faux utilisateurs A et B, supprimés à la fin) ──
-- Deux faux utilisateurs
insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

insert into public.products (id, user_id, cj_pid, cj_vid, title, cj_cost) values
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'p', 'v', 'Produit de B', 1);
insert into public.listings (user_id, product_id, market, sku, title, ebay_price) values
  ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'fr', 'sku-b', 'Annonce de B', 9.99);
insert into public.orders (user_id, market, ebay_order_id) values ('00000000-0000-0000-0000-00000000000b', 'fr', 'order-b');
insert into public.cj_accounts (user_id, api_key_enc, key_hint) values ('00000000-0000-0000-0000-00000000000b', 'v1.secret', 'abcd');
insert into public.audit_log (user_id, action) values ('00000000-0000-0000-0000-00000000000b', 'test');


do $$
declare n int;
begin
  -- On agit maintenant comme l'utilisateur A (rôle « authenticated », JWT de A)
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  select count(*) into n from public.listings;   if n <> 0 then raise exception 'ÉCHEC : A voit les annonces de B (%)', n; end if;
  select count(*) into n from public.orders;     if n <> 0 then raise exception 'ÉCHEC : A voit les commandes de B'; end if;
  select count(*) into n from public.products;   if n <> 0 then raise exception 'ÉCHEC : A voit les produits de B'; end if;
  select count(*) into n from public.audit_log;  if n <> 0 then raise exception 'ÉCHEC : A voit le journal de B'; end if;
  select count(*) into n from public.profiles where id = '00000000-0000-0000-0000-00000000000b'; if n <> 0 then raise exception 'ÉCHEC : A voit le profil de B'; end if;
  select count(*) into n from public.profiles where id = '00000000-0000-0000-0000-00000000000a'; if n <> 1 then raise exception 'ÉCHEC : A ne voit pas son PROPRE profil (policy trop stricte)'; end if;

  begin
    perform 1 from public.cj_accounts;
    raise exception 'ÉCHEC : A peut lire cj_accounts';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.ebay_accounts;
    raise exception 'ÉCHEC : A peut lire ebay_accounts';
  exception when insufficient_privilege then null; end;

  begin
    update public.listings set ebay_price = 0.01 where sku = 'sku-b';
    raise exception 'ÉCHEC : A peut modifier une annonce';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set plan = 'pro', role = 'admin';
    raise exception 'ÉCHEC : A peut s''attribuer le plan Pro / le rôle admin';
  exception when insufficient_privilege then null; end;
  begin
    update public.settings set usage = '{}'::jsonb;
    raise exception 'ÉCHEC : A peut remettre ses quotas à zéro';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.audit_log (user_id, action) values ('00000000-0000-0000-0000-00000000000a', 'forge');
    raise exception 'ÉCHEC : A peut écrire dans le journal';
  exception when insufficient_privilege then null; end;

  reset role;
  raise notice 'OK : isolation RLS validée (lecture, écriture, secrets, escalade de privilèges).';
end $$;


-- ── PARTIE 3 : nettoyage des données de test (cascade sur toutes les tables liées) ──
delete from auth.users where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');

select 'OK : tables créées et isolation RLS validée' as resultat,
       (select count(*) from information_schema.tables where table_schema = 'public' and table_name in
         ('profiles','settings','margin_rules','ebay_accounts','cj_accounts','products','listings','orders','audit_log')) as tables_dropflow;

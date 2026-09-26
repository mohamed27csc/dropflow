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

-- Printful (impression à la demande) : jeton privé, pas d'échange OAuth (contrairement à CJ, pas d'expiration à gérer).
create table if not exists public.printful_accounts (
  user_id uuid primary key references auth.users on delete cascade,
  api_token_enc text not null,
  key_hint text not null,
  store_id text,
  created_at timestamptz not null default now()
);

-- Vinted : clé stockée chiffrée, NON vérifiée (aucun endpoint public connu pour la valider).
create table if not exists public.vinted_accounts (
  user_id uuid primary key references auth.users on delete cascade,
  api_key_enc text not null,
  key_hint text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  supplier text not null default 'cj' check (supplier in ('cj', 'printful')),
  cj_pid text,
  cj_vid text,
  title text not null,
  image_url text,
  category text,
  cj_cost numeric,                -- en USD, tel que facturé par CJ (fournisseur CJ uniquement)
  shipping numeric not null default 0,
  cj_stock int,
  listed_num int not null default 0,   -- nb de vendeurs CJ (proxy de la concurrence)
  -- Printful (impression à la demande) uniquement :
  printful_variant_id int,
  printful_retail_price numeric,
  design_url text,                -- visuel généré par IA, hébergé de façon permanente (Supabase Storage)
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
  ad_rate numeric,
  zero_stock_since timestamptz,
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
  printful_order_id text,
  status text not null default 'pending' check (status in ('pending', 'ordered', 'awaiting_payment', 'shipped', 'tracking_sent', 'error', 'blocked')),
  est_cost numeric,                -- coût CJ estimé en EUR (plafond de dépense/jour)
  tracking_number text,
  tracking_carrier text,
  buyer_username text,
  thanked_at timestamptz,
  balance_issue_since timestamptz,
  stock_notice_sent_at timestamptz,
  total numeric,
  currency text,
  line_items jsonb,
  error text,
  created_at timestamptz not null default now(),
  unique (user_id, ebay_order_id)
);

-- Centre de notifications in-app (source de vérité) + best-effort push navigateur.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  type text not null,
  title text not null,
  body text,
  url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_created on public.notifications (user_id, created_at desc);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- Messages acheteurs eBay (Trading API), liés à une annonce DropFlow uniquement (jamais l'activité eBay personnelle du vendeur).
create table if not exists public.buyer_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  market text not null check (market in ('fr', 'de', 'uk')),
  ebay_message_id text not null,
  item_id text not null,
  item_title text,
  buyer text not null,
  question text not null,
  reply text,
  status text not null default 'pending' check (status in ('pending', 'auto_replied', 'escalated', 'manual_replied')),
  created_at timestamptz not null default now(),
  unique (user_id, ebay_message_id)
);
create index if not exists buyer_messages_user_created on public.buyer_messages (user_id, created_at desc);

alter table public.settings add column if not exists last_trend_digest_at timestamptz;

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
alter table public.printful_accounts enable row level security; -- pas de policy : serveur uniquement
alter table public.vinted_accounts enable row level security;   -- pas de policy : serveur uniquement
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.buyer_messages enable row level security;

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

drop policy if exists "own notifications" on public.notifications;
create policy "own notifications" on public.notifications for select using (user_id = auth.uid());
drop policy if exists "own push subs" on public.push_subscriptions;
create policy "own push subs" on public.push_subscriptions for select using (user_id = auth.uid());
drop policy if exists "own buyer messages" on public.buyer_messages;
create policy "own buyer messages" on public.buyer_messages for select using (user_id = auth.uid());

-- Défense en profondeur : les tables à secrets ne sont accessibles à AUCUN rôle client, même si une policy était ajoutée par erreur.
revoke all on public.ebay_accounts from anon, authenticated;
revoke all on public.cj_accounts from anon, authenticated;
revoke all on public.printful_accounts from anon, authenticated;
revoke all on public.vinted_accounts from anon, authenticated;
-- Le navigateur ne peut rien écrire : ni quotas (settings.usage), ni plan/rôle (profiles), ni journal. Toute écriture passe par le serveur.
revoke insert, update, delete on public.profiles, public.settings, public.margin_rules, public.products, public.listings, public.orders, public.audit_log, public.notifications, public.push_subscriptions, public.buyer_messages from anon, authenticated;
revoke all on public.audit_log, public.profiles, public.settings, public.margin_rules, public.products, public.listings, public.orders from anon;

create index if not exists listings_user_status on public.listings (user_id, status);
create index if not exists orders_user_created on public.orders (user_id, created_at desc);

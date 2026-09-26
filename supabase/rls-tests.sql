-- Tests RLS : à exécuter dans le SQL Editor Supabase (rien n'est conservé : tout est annulé à la fin).
-- Ils prouvent qu'un utilisateur A ne voit ni ne modifie les lignes de B, et n'atteint jamais les secrets.
-- Résultat attendu : aucune ligne « ÉCHEC ». Chaque test lève une exception s'il échoue.

begin;

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

-- On agit maintenant comme l'utilisateur A (rôle « authenticated », JWT de A)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

do $$
declare n int;
begin
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

  raise notice 'OK : isolation RLS validée (lecture, écriture, secrets, escalade de privilèges).';
end $$;

rollback;

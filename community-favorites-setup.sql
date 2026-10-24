-- Atlante di viaggio (Francia): preferiti condivisi anche per i luoghi aggiunti dagli utenti.
-- Migrazione ADDITIVA: eseguire in Supabase -> SQL Editor DOPO community-setup.sql.
-- Non modifica atlas_v5_*, i preferiti originali o le note esistenti.
-- Chi ha gia' eseguito community-setup.sql deve eseguire soltanto questo file.

create table if not exists public.atlas_community_favorites (
  place_id uuid not null references public.atlas_user_places(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (place_id, created_by)
);
create index if not exists atlas_community_favorites_owner_idx
  on public.atlas_community_favorites (created_by, created_at desc);

alter table public.atlas_community_favorites enable row level security;

-- I singoli voti, e quindi gli ID degli utenti, NON sono leggibili pubblicamente.
-- Soltanto i conteggi aggregati vengono restituiti dalla funzione sottostante.
revoke all on public.atlas_community_favorites from public, anon, authenticated;
grant insert, delete on public.atlas_community_favorites to authenticated;
-- La lettura e' limitata alle proprie righe e alla sola colonna place_id,
-- necessaria anche per le operazioni DELETE con filtro PostgREST.
grant select (place_id) on public.atlas_community_favorites to authenticated;
drop policy if exists atlas_community_favorites_select_own on public.atlas_community_favorites;
create policy atlas_community_favorites_select_own on public.atlas_community_favorites
  for select to authenticated using (created_by = auth.uid());

drop policy if exists atlas_community_favorites_insert on public.atlas_community_favorites;
create policy atlas_community_favorites_insert on public.atlas_community_favorites
  for insert to authenticated with check (created_by = auth.uid());
drop policy if exists atlas_community_favorites_delete_own on public.atlas_community_favorites;
create policy atlas_community_favorites_delete_own on public.atlas_community_favorites
  for delete to authenticated using (created_by = auth.uid());

-- Conta i preferiti e indica se l'utente corrente ha gia' segnalato il luogo.
-- SECURITY DEFINER e search_path bloccato consentono l'aggregazione senza
-- concedere lettura diretta dei singoli identificativi utente.
create or replace function public.atlas_community_favorite_snapshot()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'place_id', 'user-' || grouped.place_id::text,
      'favorite_count', grouped.favorite_count,
      'mine', grouped.mine
    ) order by grouped.place_id),
    '[]'::jsonb
  )
  from (
    select place_id, count(*)::integer as favorite_count,
      coalesce(bool_or(created_by = (select auth.uid())), false) as mine
    from public.atlas_community_favorites
    group by place_id
  ) as grouped;
$$;
revoke all on function public.atlas_community_favorite_snapshot() from public, anon, authenticated;
grant execute on function public.atlas_community_favorite_snapshot() to anon, authenticated;

-- Limite semplice per identita' anonima, non sostituisce CAPTCHA/rate-limit a livello API.
create or replace function public.atlas_community_favorite_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare recent_count integer;
begin
  if auth.uid() is null or new.created_by is distinct from auth.uid() then
    raise exception 'Preferito non autorizzato';
  end if;
  new.created_at := now();
  select count(*) into recent_count from public.atlas_community_favorites
    where created_by = auth.uid() and created_at > now() - interval '24 hours';
  if recent_count >= 100 then
    raise exception 'RATE_LIMIT: massimo 100 nuovi preferiti nelle ultime 24 ore';
  end if;
  return new;
end;
$$;
revoke all on function public.atlas_community_favorite_limit() from public, anon, authenticated;
drop trigger if exists atlas_community_favorite_limit on public.atlas_community_favorites;
create trigger atlas_community_favorite_limit before insert on public.atlas_community_favorites
  for each row execute function public.atlas_community_favorite_limit();

-- Aggiorna lo schema esposto dall'API REST Supabase.
notify pgrst, 'reload schema';

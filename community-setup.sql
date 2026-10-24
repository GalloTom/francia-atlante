-- Francia Atlante: additive SQL migration for user-added places and map reports.
-- Run ONCE in Supabase -> SQL Editor on the same project as cloud-config.js.
-- This migration does not touch atlas_v5_* functions or old favorites/notes tables.
-- Keep Anonymous Sign-Ins enabled in Authentication settings.

create table if not exists public.atlas_user_places (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  region text not null check (char_length(trim(region)) between 2 and 90),
  category text not null check (category in ('borghi','costa','natura','castelli','religione','musei','megaliti','memoria','fari','patrimonio','gastronomia','alloggi','shopping','attivita','spettacoli','servizi')),
  description text not null default '' check (char_length(description)<=2000),
  maps_url text not null check (char_length(maps_url)<=2000 and maps_url ~* '^https://(www\.)?google\.(com|fr|it|co\.uk|de|es|ca|be|ch|nl|com\.au)/maps(/|\?|$)|^https://maps\.google\.(com|fr|it|co\.uk|de|es|ca|be|ch|nl|com\.au)/|^https://maps\.app\.goo\.gl/|^https://goo\.gl/maps/'),
  lat double precision not null check (lat between 40.5 and 52),
  lon double precision not null check (lon between -6 and 10.5),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.atlas_place_corrections (
  id uuid primary key default gen_random_uuid(),
  place_id text not null check (char_length(place_id) between 5 and 90 and place_id ~ '^[a-zA-Z0-9-]+$'),
  maps_url text not null check (char_length(maps_url)<=2000 and maps_url ~* '^https://(www\.)?google\.(com|fr|it|co\.uk|de|es|ca|be|ch|nl|com\.au)/maps(/|\?|$)|^https://maps\.google\.(com|fr|it|co\.uk|de|es|ca|be|ch|nl|com\.au)/|^https://maps\.app\.goo\.gl/|^https://goo\.gl/maps/'),
  lat double precision not null check (lat between 40.5 and 52),
  lon double precision not null check (lon between -6 and 10.5),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists atlas_user_places_created_idx on public.atlas_user_places(created_at);
create index if not exists atlas_place_corrections_place_idx on public.atlas_place_corrections(place_id,created_at desc);
create index if not exists atlas_place_corrections_owner_idx on public.atlas_place_corrections(created_by,created_at desc);

alter table public.atlas_user_places enable row level security;
alter table public.atlas_place_corrections enable row level security;

drop policy if exists atlas_places_read on public.atlas_user_places;
create policy atlas_places_read on public.atlas_user_places for select to anon, authenticated using (true);
drop policy if exists atlas_places_insert on public.atlas_user_places;
create policy atlas_places_insert on public.atlas_user_places for insert to authenticated with check (auth.uid()=created_by);
drop policy if exists atlas_places_delete_own on public.atlas_user_places;
create policy atlas_places_delete_own on public.atlas_user_places for delete to authenticated using (auth.uid()=created_by);

drop policy if exists atlas_reports_read on public.atlas_place_corrections;
create policy atlas_reports_read on public.atlas_place_corrections for select to anon, authenticated using (true);
drop policy if exists atlas_reports_insert on public.atlas_place_corrections;
create policy atlas_reports_insert on public.atlas_place_corrections for insert to authenticated with check (auth.uid()=created_by);
drop policy if exists atlas_reports_delete_own on public.atlas_place_corrections;
create policy atlas_reports_delete_own on public.atlas_place_corrections for delete to authenticated using (auth.uid()=created_by);

revoke all on public.atlas_user_places from anon, authenticated;
revoke all on public.atlas_place_corrections from anon, authenticated;
grant select on public.atlas_user_places,public.atlas_place_corrections to anon,authenticated;
grant insert,delete on public.atlas_user_places,public.atlas_place_corrections to authenticated;

-- Contributi senza soglie giornaliere: il trigger controlla l'autore e impedisce
-- la falsificazione della data, senza limitare il numero di nuove posizioni.
create or replace function public.atlas_community_rate_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_uid uuid;
begin
  v_uid := (select auth.uid());
  if v_uid is null or new.created_by is distinct from v_uid then
    raise exception 'Autore non autorizzato' using errcode = '42501';
  end if;
  new.created_at := now();
  return new;
end;
$$;
revoke all on function public.atlas_community_rate_limit() from public,anon,authenticated;
drop trigger if exists atlas_places_rate_limit on public.atlas_user_places;
create trigger atlas_places_rate_limit before insert on public.atlas_user_places
for each row execute function public.atlas_community_rate_limit();
drop trigger if exists atlas_reports_rate_limit on public.atlas_place_corrections;
create trigger atlas_reports_rate_limit before insert on public.atlas_place_corrections
for each row execute function public.atlas_community_rate_limit();

-- Removing a community-created place also removes reports about that place.
create or replace function public.atlas_community_cleanup_reports()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.atlas_place_corrections where place_id='user-'||old.id::text;
  return old;
end;
$$;
revoke all on function public.atlas_community_cleanup_reports() from public,anon,authenticated;
drop trigger if exists atlas_community_places_cleanup on public.atlas_user_places;
create trigger atlas_community_places_cleanup after delete on public.atlas_user_places
for each row execute function public.atlas_community_cleanup_reports();

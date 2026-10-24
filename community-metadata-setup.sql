-- Atlante di viaggio - Francia: modifica condivisa di nome, regione e categoria.
-- Eseguire nel SQL Editor del progetto Supabase dopo community-setup.sql.
-- Non elimina alcuna tabella o dato: crea una tabella di override dei metadati.
-- Pubblicare anche app.js, community.js e index.html del nuovo ZIP.
-- Richiede Anonymous Sign-Ins attivi in Authentication.

create table if not exists public.atlas_place_metadata_edits (
  place_id text primary key check (char_length(place_id) between 5 and 90 and place_id ~ '^[a-zA-Z0-9-]+$'),
  name text not null check (char_length(trim(name)) between 2 and 120),
  region text not null check (char_length(trim(region)) between 2 and 90),
  category text not null check (category in (
    'borghi','costa','natura','castelli','religione','musei','megaliti','memoria',
    'fari','patrimonio','gastronomia','alloggi','shopping','attivita','spettacoli','servizi'
  )),
  updated_by uuid not null default auth.uid(),
  updated_at timestamptz not null default now()
);

alter table public.atlas_place_metadata_edits enable row level security;

drop policy if exists atlas_metadata_read on public.atlas_place_metadata_edits;
create policy atlas_metadata_read on public.atlas_place_metadata_edits
  for select to anon, authenticated using (true);

drop policy if exists atlas_metadata_insert on public.atlas_place_metadata_edits;
create policy atlas_metadata_insert on public.atlas_place_metadata_edits
  for insert to authenticated with check ((select auth.uid())=updated_by);

drop policy if exists atlas_metadata_update on public.atlas_place_metadata_edits;
create policy atlas_metadata_update on public.atlas_place_metadata_edits
  for update to authenticated using (true) with check ((select auth.uid())=updated_by);

revoke all on public.atlas_place_metadata_edits from public, anon, authenticated;
grant select on public.atlas_place_metadata_edits to anon, authenticated;
grant insert, update on public.atlas_place_metadata_edits to authenticated;

-- L'identita' dell'ultimo editor e la data vengono assegnate esclusivamente
-- dal server, indipendentemente dai valori indicati nel browser.
create or replace function public.atlas_metadata_stamp()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_uid uuid;
begin
  v_uid := (select auth.uid());
  if v_uid is null then
    raise exception 'Utente anonimo non autenticato' using errcode='42501';
  end if;
  new.updated_by := v_uid;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.atlas_metadata_stamp() from public, anon, authenticated;
drop trigger if exists atlas_metadata_stamp_trigger on public.atlas_place_metadata_edits;
create trigger atlas_metadata_stamp_trigger
  before insert or update on public.atlas_place_metadata_edits
  for each row execute function public.atlas_metadata_stamp();

-- Controllo: deve restituire una riga con valore true.
select to_regclass('public.atlas_place_metadata_edits') is not null as tabella_pronta;

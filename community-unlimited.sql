-- Atlante di viaggio - Francia: contributi della comunita' senza soglie giornaliere.
-- Da eseguire in Supabase > SQL Editor DOPO community-setup.sql e
-- community-favorites-setup.sql. Ripetibile, non cancella o modifica dati.
-- Rimuove i limiti applicativi per nuovi luoghi, correzioni e preferiti.
-- Mantiene il controllo auth.uid() = created_by e la normalizzazione created_at.
-- Non disabilita RLS, i controlli sui campi, o i limiti infrastrutturali Supabase (HTTP 429).

-- I trigger atlas_places_rate_limit e atlas_reports_rate_limit restano collegati
-- a questa funzione, ma effettuano solo un controllo sull'autore, senza contatori.
create or replace function public.atlas_community_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  v_uid := (select auth.uid());
  if v_uid is null or new.created_by is distinct from v_uid then
    raise exception 'Autore non autorizzato' using errcode = '42501';
  end if;
  new.created_at := now();
  return new;
end;
$$;
revoke all on function public.atlas_community_rate_limit()
  from public, anon, authenticated;

-- Il trigger atlas_community_favorite_limit resta collegato a questa funzione,
-- che controlla solo che il preferito sia creato dall'utente corrente.
create or replace function public.atlas_community_favorite_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  v_uid := (select auth.uid());
  if v_uid is null or new.created_by is distinct from v_uid then
    raise exception 'Preferito non autorizzato' using errcode = '42501';
  end if;
  new.created_at := now();
  return new;
end;
$$;
revoke all on function public.atlas_community_favorite_limit()
  from public, anon, authenticated;

-- Controllo: tre trigger abilitati, con le funzioni aggiornate.
-- Stato 'O' = trigger abilitato. Il conteggio deve essere pari a 3.
select
  count(*)::integer as trigger_presenti,
  count(*) filter (where t.tgenabled = 'O')::integer as trigger_abilitati,
  case when count(*) = 3 and bool_and(t.tgenabled = 'O') then 'OK' else 'DA VERIFICARE' end as esito
from pg_catalog.pg_trigger t
join pg_catalog.pg_class c on c.oid = t.tgrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and t.tgname in ('atlas_places_rate_limit','atlas_reports_rate_limit','atlas_community_favorite_limit')
  and not t.tgisinternal;

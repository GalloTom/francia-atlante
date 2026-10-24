-- Atlante di viaggio - Francia: editing condiviso dei testi dei luoghi creati dagli utenti.
-- Applicare DOPO community-metadata-setup.sql (richiede la tabella atlas_place_metadata_edits).
-- Non altera luoghi, preferiti, note personali o testi delle guide originali.
-- Ripetibile. Richiede Anonymous Sign-Ins attivi; tutti gli utenti autenticati anonimi
-- possono modificare i testi dei luoghi aggiunti da utenti.

begin;

do $$
begin
  if to_regclass('public.atlas_place_metadata_edits') is null then
    raise exception 'Eseguire prima community-metadata-setup.sql';
  end if;
end;
$$;

alter table public.atlas_place_metadata_edits
  add column if not exists description text,
  add column if not exists information text,
  add column if not exists place_notes text;

-- NULL indica nessuna modifica: manteniamo la descrizione originale inserita.
-- Una stringa vuota indica invece la rimozione volontaria del contenuto.
do $$
begin
 if not exists(select 1 from pg_constraint where conname='atlas_metadata_content_lengths' and conrelid='public.atlas_place_metadata_edits'::regclass) then
  alter table public.atlas_place_metadata_edits
   add constraint atlas_metadata_content_lengths check (
    (description is null or char_length(description)<=2000) and
    (information is null or char_length(information)<=4000) and
    (place_notes is null or char_length(place_notes)<=4000)
   );
 end if;
 if not exists(select 1 from pg_constraint where conname='atlas_metadata_content_user_only' and conrelid='public.atlas_place_metadata_edits'::regclass) then
  alter table public.atlas_place_metadata_edits
   add constraint atlas_metadata_content_user_only check (
    place_id like 'user-%' or (description is null and information is null and place_notes is null)
   );
 end if;
end;
$$;

-- I browser con una versione vecchia del sito non devono cancellare per errore
-- i nuovi campi quando aggiornano soltanto nome, regione o categoria.
create or replace function public.atlas_metadata_preserve_content()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.description is null then new.description:=old.description; end if;
  if new.information is null then new.information:=old.information; end if;
  if new.place_notes is null then new.place_notes:=old.place_notes; end if;
  return new;
end;
$$;
revoke all on function public.atlas_metadata_preserve_content() from public, anon, authenticated;
drop trigger if exists atlas_metadata_preserve_content_trigger on public.atlas_place_metadata_edits;
create trigger atlas_metadata_preserve_content_trigger
 before update on public.atlas_place_metadata_edits
 for each row execute function public.atlas_metadata_preserve_content();

-- Pulizia dei testi personalizzati quando il proprietario elimina il luogo.
create or replace function public.atlas_metadata_remove_deleted_place()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 delete from public.atlas_place_metadata_edits where place_id='user-'||old.id::text;
 return old;
end;
$$;
revoke all on function public.atlas_metadata_remove_deleted_place() from public, anon, authenticated;
drop trigger if exists atlas_metadata_remove_deleted_place_trigger on public.atlas_user_places;
create trigger atlas_metadata_remove_deleted_place_trigger
 after delete on public.atlas_user_places
 for each row execute function public.atlas_metadata_remove_deleted_place();

-- Privilegi e policy per nome/categoria rimangono quelli di community-metadata-setup.sql.
-- I nuovi campi usano gli stessi permessi RLS e lo stesso trigger atlas_metadata_stamp.
select to_regclass('public.atlas_place_metadata_edits') is not null as tabella_pronta,
       count(*) filter (where column_name in ('description','information','place_notes'))=3 as campi_pronti
  from information_schema.columns
 where table_schema='public' and table_name='atlas_place_metadata_edits';
commit;

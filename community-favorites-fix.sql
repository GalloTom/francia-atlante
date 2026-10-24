-- Atlante di viaggio - Francia: correzione salvataggio preferiti dei luoghi aggiunti.
-- Eseguire in Supabase > SQL Editor DOPO community-favorites-setup.sql.
-- Migrazione ripetibile: non elimina preferiti, localita', correzioni o note esistenti.

-- Compatibilita' con il sito gia' pubblicato: le richieste PostgREST di
-- INSERT/DELETE possono richiedere la lettura di colonne oltre place_id.
-- Le policy RLS gia' esistenti limitano comunque la SELECT alle SOLE righe
-- dell'utente corrente, senza rendere pubblici i preferiti individuali.
grant select on table public.atlas_community_favorites to authenticated;

-- Nuovo endpoint di scrittura: una sola RPC verifica auth.uid() e modifica
-- soltanto il preferito dell'utente autenticato (inclusi Anonymous Sign-Ins).
-- Evita richieste dirette dal browser con privilegi di colonna parziali.
create or replace function public.atlas_community_set_favorite(
  p_place_id uuid,
  p_value boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_count integer;
  v_mine boolean;
begin
  v_user_id := (select auth.uid());
  if v_user_id is null then
    raise exception 'Utente non autenticato: attiva Anonymous Sign-Ins.' using errcode='42501';
  end if;
  if p_place_id is null or p_value is null then
    raise exception 'Luogo o operazione non validi.' using errcode='22023';
  end if;
  if not exists (select 1 from public.atlas_user_places where id=p_place_id) then
    raise exception 'Il luogo non esiste piu''.' using errcode='22023';
  end if;

  if p_value then
    insert into public.atlas_community_favorites (place_id, created_by)
    values (p_place_id, v_user_id)
    on conflict (place_id, created_by) do nothing;
  else
    delete from public.atlas_community_favorites
    where place_id = p_place_id and created_by = v_user_id;
  end if;

  select count(*)::integer, coalesce(bool_or(created_by=v_user_id),false)
  into v_count, v_mine
  from public.atlas_community_favorites
  where place_id = p_place_id;

  return jsonb_build_object(
    'place_id', 'user-' || p_place_id::text,
    'favorite_count', v_count,
    'mine', v_mine
  );
end;
$$;

-- Importante: una funzione SECURITY DEFINER deve essere accessibile
-- esclusivamente ai ruoli necessari, non al pubblico senza sessione.
revoke all on function public.atlas_community_set_favorite(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.atlas_community_set_favorite(uuid, boolean)
  to authenticated;

notify pgrst, 'reload schema';

-- Controllo finale: entrambi i risultati devono essere true.
select
  has_table_privilege('authenticated', 'public.atlas_community_favorites', 'SELECT') as lettura_abilitata,
  has_function_privilege('authenticated', 'public.atlas_community_set_favorite(uuid,boolean)', 'EXECUTE') as funzione_abilitata;

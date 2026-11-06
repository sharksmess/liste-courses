-- 0008 — Retrait d'un membre et depart volontaire (ERD §4.1, §4.6, §4.7, §5 ;
-- ADR-0005). Ecrite a la main (drizzle-kit generate --custom). Fonctions seules :
-- ni table, ni colonne, ni politique, ni role. lc.membership, ses politiques et
-- ses triggers membership_count, membership_protect_owner et membership_immutable
-- existent depuis 0002 et 0004, et portent les invariants de cette tranche.

-- ---------------------------------------------------------------------------
-- lc.remove_member(uuid) (ERD §4.6) — appelant : lc_app
-- ---------------------------------------------------------------------------

CREATE FUNCTION lc.remove_member(p_membership_id uuid) RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = pg_catalog, lc, pg_temp
AS $$
DECLARE
  v_user uuid;
  v_own  uuid;
  v_hh   uuid;
  v_role text;
  v_n    integer;
BEGIN
  -- 1. Contexte d'abord : l'utilisateur de session, jamais un parametre ; un
  -- app.household_id pose par l'appelant est ecrase, jamais lu.
  v_user := lc.current_user_id();
  IF v_user IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'LC001', MESSAGE = 'contexte utilisateur absent';
  END IF;
  PERFORM set_config('app.household_id', '', true);

  -- 2. Appartenance et role de l'appelant (membership_definer_self_read) : refus
  -- avant toute ecriture, et avant de rien apprendre de la cible.
  SELECT m.id, m.household_id, m.role INTO v_own, v_hh, v_role FROM lc.membership m WHERE m.user_id = v_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'LC009', MESSAGE = 'aucun foyer';
  END IF;
  IF v_role <> 'owner' THEN
    RAISE EXCEPTION USING ERRCODE = 'LC005', MESSAGE = 'reserve a la responsable';
  END IF;

  -- 3. Valeur de confiance : le foyer de l'appelant.
  PERFORM set_config('app.household_id', v_hh::text, true);

  -- 4. La responsable ne se retire pas. Une autre responsable visee reste LC006 :
  -- elle est hors du foyer, donc indistinguable d'une cible inexistante.
  IF p_membership_id = v_own THEN
    RAISE EXCEPTION USING ERRCODE = 'LC007', MESSAGE = 'la responsable ne peut pas etre retiree';
  END IF;

  -- 5. Cible inexistante, deja partie ou d'un autre foyer : indistinguables. Le
  -- trigger decremente member_count sous le verrou de la ligne du foyer.
  DELETE FROM lc.membership WHERE id = p_membership_id AND household_id = v_hh AND role = 'member';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'LC006', MESSAGE = 'membre introuvable';
  END IF;

  -- 6. Contexte remis a vide.
  PERFORM set_config('app.household_id', '', true);
END
$$;
ALTER FUNCTION lc.remove_member(uuid) OWNER TO lc_definer;
REVOKE ALL ON FUNCTION lc.remove_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lc.remove_member(uuid) TO lc_app;

-- ---------------------------------------------------------------------------
-- lc.leave_household() (ERD §4.7) — appelant : lc_app
-- ---------------------------------------------------------------------------

CREATE FUNCTION lc.leave_household() RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = pg_catalog, lc, pg_temp
AS $$
DECLARE
  v_user uuid;
  v_own  uuid;
  v_hh   uuid;
  v_role text;
  v_n    integer;
BEGIN
  -- 1. Contexte d'abord.
  v_user := lc.current_user_id();
  IF v_user IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'LC001', MESSAGE = 'contexte utilisateur absent';
  END IF;
  PERFORM set_config('app.household_id', '', true);

  -- 2. Appartenance et role de l'appelant : la responsable ne part jamais (D-010).
  SELECT m.id, m.household_id, m.role INTO v_own, v_hh, v_role FROM lc.membership m WHERE m.user_id = v_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'LC009', MESSAGE = 'aucun foyer';
  END IF;
  IF v_role = 'owner' THEN
    RAISE EXCEPTION USING ERRCODE = 'LC007', MESSAGE = 'la responsable ne peut pas quitter le foyer';
  END IF;

  -- 3. Valeur de confiance : le foyer de l'appelant.
  PERFORM set_config('app.household_id', v_hh::text, true);

  -- 4. Zero ligne : retire ou parti entre la lecture et la suppression. Le trigger
  -- decremente member_count sous le verrou de la ligne du foyer.
  DELETE FROM lc.membership WHERE id = v_own AND role = 'member';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'LC009', MESSAGE = 'aucun foyer';
  END IF;

  -- 5. Contexte remis a vide.
  PERFORM set_config('app.household_id', '', true);
END
$$;
ALTER FUNCTION lc.leave_household() OWNER TO lc_definer;
REVOKE ALL ON FUNCTION lc.leave_household() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lc.leave_household() TO lc_app;

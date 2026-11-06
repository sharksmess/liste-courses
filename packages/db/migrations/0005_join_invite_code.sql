-- 0005 — Adhesion par code et gestion du code d'invitation (ERD §4.1, §4.4, §4.5,
-- §5 ; ADR-0004, ADR-0005). Ecrite a la main (drizzle-kit generate --custom).
-- Fonctions seules : ni table, ni colonne, ni politique, ni role. lc.invite_code,
-- ses politiques et les contraintes invite_code_code_key, household_member_limit
-- et membership_user_key existent depuis 0002 et 0004.

-- ---------------------------------------------------------------------------
-- lc.join_household(text) (ERD §4.4) — appelant : lc_app
-- ---------------------------------------------------------------------------

CREATE FUNCTION lc.join_household(p_code text) RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = pg_catalog, lc, pg_temp
AS $$
DECLARE
  v_user uuid;
  v_hh   uuid;
  v_name text;
  v_con  text;
BEGIN
  -- 1. Contexte d'abord : l'utilisateur de session, jamais un parametre ; un
  -- app.household_id pose par l'appelant est ecrase, jamais lu.
  v_user := lc.current_user_id();
  IF v_user IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'LC001', MESSAGE = 'contexte utilisateur absent';
  END IF;
  PERFORM set_config('app.household_id', '', true);

  -- 2. Deja membre (membership_definer_self_read).
  IF EXISTS (SELECT 1 FROM lc.membership WHERE user_id = v_user) THEN
    RAISE EXCEPTION USING ERRCODE = 'LC002', MESSAGE = 'deja membre d''un foyer';
  END IF;

  -- 3. Forme normalisee exigee ; la normalisation de la saisie vit dans le seul
  -- schema de validation applicatif (ERD Q-5).
  IF p_code IS NULL OR p_code !~ '^[0-9A-HJKMNP-TV-Z]{10}$' THEN
    RAISE EXCEPTION USING ERRCODE = 'LC003', MESSAGE = 'code d''invitation invalide';
  END IF;

  -- 4. Seule lecture transverse aux foyers (invite_code_definer_lookup) : le
  -- reglage transitoire est remis a vide avant toute conclusion.
  PERFORM set_config('app.invite_code_lookup', p_code, true);
  SELECT household_id INTO v_hh FROM lc.invite_code WHERE code = p_code;
  PERFORM set_config('app.invite_code_lookup', '', true);
  IF v_hh IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'LC003', MESSAGE = 'code d''invitation invalide';
  END IF;

  -- 5. Valeur de confiance : le foyer de la ligne de code.
  PERFORM set_config('app.household_id', v_hh::text, true);

  -- 6. Le verrou partage bloque une regeneration concurrente jusqu'a la fin de
  -- l'adhesion ; si elle a commite, la ligne relue ne correspond plus.
  PERFORM 1 FROM lc.invite_code WHERE household_id = v_hh AND code = p_code FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'LC003', MESSAGE = 'code d''invitation invalide';
  END IF;

  -- 7. Prenom copie (app_user_definer_self_read).
  SELECT u.name INTO v_name FROM lc_auth.app_user u WHERE u.id = v_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'LC001', MESSAGE = 'compte introuvable';
  END IF;

  -- 8. Toujours member ; le trigger incremente member_count sous le verrou de la
  -- ligne du foyer. Toute autre contrainte est relevee telle quelle.
  BEGIN
    INSERT INTO lc.membership (household_id, user_id, role, display_name)
      VALUES (v_hh, v_user, 'member', v_name);
  EXCEPTION
    WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
      IF v_con = 'household_member_limit' THEN
        RAISE EXCEPTION USING ERRCODE = 'LC004', MESSAGE = 'foyer complet';
      END IF;
      RAISE;
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
      IF v_con = 'membership_user_key' THEN
        RAISE EXCEPTION USING ERRCODE = 'LC002', MESSAGE = 'deja membre d''un foyer';
      END IF;
      RAISE;
  END;

  -- 9. Contexte remis a vide.
  PERFORM set_config('app.household_id', '', true);
END
$$;
ALTER FUNCTION lc.join_household(text) OWNER TO lc_definer;
REVOKE ALL ON FUNCTION lc.join_household(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lc.join_household(text) TO lc_app;

-- ---------------------------------------------------------------------------
-- lc.get_invite_code() (ERD §4.5) — appelant : lc_app
-- ---------------------------------------------------------------------------

CREATE FUNCTION lc.get_invite_code() RETURNS text
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = pg_catalog, lc, pg_temp
AS $$
DECLARE
  v_user uuid;
  v_hh   uuid;
  v_role text;
  v_code text;
BEGIN
  -- 1. Contexte d'abord.
  v_user := lc.current_user_id();
  IF v_user IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'LC001', MESSAGE = 'contexte utilisateur absent';
  END IF;
  PERFORM set_config('app.household_id', '', true);

  -- 2. Appartenance et role de l'appelant (membership_definer_self_read).
  SELECT m.household_id, m.role INTO v_hh, v_role FROM lc.membership m WHERE m.user_id = v_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'LC009', MESSAGE = 'aucun foyer';
  END IF;
  IF v_role <> 'owner' THEN
    RAISE EXCEPTION USING ERRCODE = 'LC005', MESSAGE = 'reserve a la responsable';
  END IF;

  -- 3. Valeur de confiance : le foyer de l'appelant.
  PERFORM set_config('app.household_id', v_hh::text, true);

  SELECT c.code INTO v_code FROM lc.invite_code c WHERE c.household_id = v_hh;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'code d''invitation absent';
  END IF;

  -- Contexte remis a vide.
  PERFORM set_config('app.household_id', '', true);
  PERFORM set_config('app.invite_code_lookup', '', true);
  RETURN v_code;
END
$$;
ALTER FUNCTION lc.get_invite_code() OWNER TO lc_definer;
REVOKE ALL ON FUNCTION lc.get_invite_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lc.get_invite_code() TO lc_app;

-- ---------------------------------------------------------------------------
-- lc.regenerate_invite_code() (ERD §4.5) — appelant : lc_app
-- ---------------------------------------------------------------------------

CREATE FUNCTION lc.regenerate_invite_code() RETURNS text
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = pg_catalog, lc, pg_temp
AS $$
DECLARE
  v_user  uuid;
  v_hh    uuid;
  v_role  text;
  v_old   text;
  v_new   text;
  v_con   text;
  v_n     integer;
  v_tries integer := 0;
BEGIN
  -- 1. Contexte d'abord.
  v_user := lc.current_user_id();
  IF v_user IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'LC001', MESSAGE = 'contexte utilisateur absent';
  END IF;
  PERFORM set_config('app.household_id', '', true);

  -- 2. Appartenance et role de l'appelant : refus avant toute ecriture.
  SELECT m.household_id, m.role INTO v_hh, v_role FROM lc.membership m WHERE m.user_id = v_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'LC009', MESSAGE = 'aucun foyer';
  END IF;
  IF v_role <> 'owner' THEN
    RAISE EXCEPTION USING ERRCODE = 'LC005', MESSAGE = 'reserve a la responsable';
  END IF;

  -- 3. Valeur de confiance : le foyer de l'appelant.
  PERFORM set_config('app.household_id', v_hh::text, true);

  SELECT c.code INTO v_old FROM lc.invite_code c WHERE c.household_id = v_hh;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'code d''invitation absent';
  END IF;

  -- Tirage d'une valeur differente et unique, 5 essais au plus. Le tirage egal
  -- au code en vigueur compte comme un essai : l'index unique ne le refuserait pas.
  LOOP
    v_tries := v_tries + 1;
    v_new := lc.new_invite_code();
    IF v_new <> v_old THEN
      BEGIN
        UPDATE lc.invite_code SET code = v_new, issued_at = now() WHERE household_id = v_hh;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n <> 1 THEN
          RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'code d''invitation absent';
        END IF;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
        IF v_con <> 'invite_code_code_key' THEN
          RAISE;
        END IF;
      END;
    END IF;
    IF v_tries >= 5 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'code d''invitation : collisions repetees';
    END IF;
  END LOOP;

  -- Contexte remis a vide.
  PERFORM set_config('app.household_id', '', true);
  PERFORM set_config('app.invite_code_lookup', '', true);
  RETURN v_new;
END
$$;
ALTER FUNCTION lc.regenerate_invite_code() OWNER TO lc_definer;
REVOKE ALL ON FUNCTION lc.regenerate_invite_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lc.regenerate_invite_code() TO lc_app;

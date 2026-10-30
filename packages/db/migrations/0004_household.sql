-- 0004 — Foyer, appartenance, code d'invitation : proprietaire, RLS, privileges,
-- fonctions et triggers (ERD §2, §3.2 a §3.4, §4.2, §4.3, §4.9, §4.10 ; ADR-0005).
-- Ecrite a la main (drizzle-kit generate --custom). Tranche 001 : aucune fonction
-- join_household, get_invite_code, regenerate_invite_code, remove_member,
-- leave_household ni add_item (tranches 002 a 004).

ALTER TABLE lc.household   OWNER TO lc_owner;
ALTER TABLE lc.membership  OWNER TO lc_owner;
ALTER TABLE lc.invite_code OWNER TO lc_owner;

ALTER TABLE lc.household   ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc.household   FORCE  ROW LEVEL SECURITY;
ALTER TABLE lc.membership  ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc.membership  FORCE  ROW LEVEL SECURITY;
ALTER TABLE lc.invite_code ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc.invite_code FORCE  ROW LEVEL SECURITY;

REVOKE ALL ON lc.household, lc.membership, lc.invite_code FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Primitives de contexte (ERD §2)
-- ---------------------------------------------------------------------------

-- Foyer de l'utilisateur de session : primitive des politiques de lc_app. Ne
-- leve pas sur contexte absent (exception documentee, ERD §4.2) : NULL, donc
-- aucune ligne. S'execute sous lc_definer, dont les politiques sur membership
-- n'appellent pas cette fonction (invariant R1 : pas de recursion).
CREATE FUNCTION lc.current_household_id() RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, lc, pg_temp
AS $$
  SELECT m.household_id FROM lc.membership m WHERE m.user_id = lc.current_user_id()
$$;
ALTER FUNCTION lc.current_household_id() OWNER TO lc_definer;
REVOKE ALL ON FUNCTION lc.current_household_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lc.current_household_id() TO lc_app;

-- Contexte de foyer pose par les seules fonctions de lc_definer ; lu par les
-- seules politiques TO lc_definer (invariant R2). Aucun GRANT.
CREATE FUNCTION lc.context_household_id() RETURNS uuid
  LANGUAGE sql
  STABLE
  SET search_path = pg_catalog, lc, pg_temp
AS $$
  SELECT nullif(current_setting('app.household_id', true), '')::uuid
$$;
ALTER FUNCTION lc.context_household_id() OWNER TO lc_definer;
REVOKE ALL ON FUNCTION lc.context_household_id() FROM PUBLIC;

-- Code d'invitation : 10 tirages uniformes dans l'alphabet de Crockford (32
-- symboles), octet 0 d'un gen_random_uuid() (aleatoire, pg_strong_random).
CREATE FUNCTION lc.new_invite_code() RETURNS text
  LANGUAGE plpgsql
  VOLATILE
  SET search_path = pg_catalog, lc, pg_temp
AS $$
DECLARE
  v_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_code text := '';
BEGIN
  FOR i IN 1..10 LOOP
    v_code := v_code || substr(v_alphabet, (get_byte(uuid_send(gen_random_uuid()), 0) & 31) + 1, 1);
  END LOOP;
  RETURN v_code;
END
$$;
ALTER FUNCTION lc.new_invite_code() OWNER TO lc_owner;
REVOKE ALL ON FUNCTION lc.new_invite_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lc.new_invite_code() TO lc_definer;

-- ---------------------------------------------------------------------------
-- Privileges (matrice ERD §1)
-- ---------------------------------------------------------------------------

GRANT SELECT ON lc.household TO lc_app;
GRANT SELECT, INSERT ON lc.household TO lc_definer;
GRANT UPDATE (member_count, item_count) ON lc.household TO lc_definer;

GRANT SELECT ON lc.membership TO lc_app;
GRANT SELECT, INSERT, DELETE ON lc.membership TO lc_definer;

-- lc_app : aucun droit sur invite_code.
GRANT SELECT, INSERT ON lc.invite_code TO lc_definer;
GRANT UPDATE (code, issued_at) ON lc.invite_code TO lc_definer;

-- ---------------------------------------------------------------------------
-- Politiques
-- ---------------------------------------------------------------------------

CREATE POLICY household_member_select ON lc.household
  FOR SELECT TO lc_app USING (id = (SELECT lc.current_household_id()));
CREATE POLICY household_definer_select ON lc.household
  FOR SELECT TO lc_definer USING (id = lc.context_household_id());
CREATE POLICY household_definer_insert ON lc.household
  FOR INSERT TO lc_definer WITH CHECK (id = lc.context_household_id());
CREATE POLICY household_definer_update ON lc.household
  FOR UPDATE TO lc_definer
  USING (id = lc.context_household_id())
  WITH CHECK (id = lc.context_household_id());

CREATE POLICY membership_member_select ON lc.membership
  FOR SELECT TO lc_app USING (household_id = (SELECT lc.current_household_id()));
CREATE POLICY membership_definer_context ON lc.membership
  FOR ALL TO lc_definer
  USING (household_id = lc.context_household_id())
  WITH CHECK (household_id = lc.context_household_id());
CREATE POLICY membership_definer_self_read ON lc.membership
  FOR SELECT TO lc_definer USING (user_id = lc.current_user_id());

CREATE POLICY invite_code_definer_context ON lc.invite_code
  FOR ALL TO lc_definer
  USING (household_id = lc.context_household_id())
  WITH CHECK (household_id = lc.context_household_id());
-- Recherche transverse par code (join_household, tranche 002) : reglage
-- transitoire ; absent ou vide, aucune ligne.
CREATE POLICY invite_code_definer_lookup ON lc.invite_code
  FOR SELECT TO lc_definer USING (code = nullif(current_setting('app.invite_code_lookup', true), ''));

-- ---------------------------------------------------------------------------
-- Triggers de membership (ERD §3.3, §4.9)
-- ---------------------------------------------------------------------------

-- Au moins une responsable : aucun chemin ne supprime la ligne owner.
CREATE FUNCTION lc.membership_protect_owner() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, lc, pg_temp
AS $$
BEGIN
  IF OLD.role = 'owner' THEN
    RAISE EXCEPTION USING ERRCODE = 'LC007', MESSAGE = 'la responsable ne peut ni etre retiree ni partir';
  END IF;
  RETURN OLD;
END
$$;
ALTER FUNCTION lc.membership_protect_owner() OWNER TO lc_owner;
REVOKE ALL ON FUNCTION lc.membership_protect_owner() FROM PUBLIC;

-- Ligne immuable : on part et on revient, on ne modifie pas.
CREATE FUNCTION lc.membership_immutable() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, lc, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'une appartenance est immuable';
END
$$;
ALTER FUNCTION lc.membership_immutable() OWNER TO lc_owner;
REVOKE ALL ON FUNCTION lc.membership_immutable() FROM PUBLIC;

-- Compteur de membres : suit toute insertion et toute suppression. SECURITY
-- DEFINER : aucun role appelant n'a UPDATE sur les compteurs.
CREATE FUNCTION lc.membership_count_trg() RETURNS trigger
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = pg_catalog, lc, pg_temp
AS $$
DECLARE
  v_prev  text;
  v_hh    uuid;
  v_delta integer;
  v_n     integer;
BEGIN
  v_prev := current_setting('app.household_id', true);
  IF TG_OP = 'INSERT' THEN
    v_hh := NEW.household_id;
    v_delta := 1;
  ELSE
    v_hh := OLD.household_id;
    v_delta := -1;
  END IF;
  -- Valeur de confiance : la ligne a passe la politique de son role.
  PERFORM set_config('app.household_id', v_hh::text, true);
  UPDATE lc.household SET member_count = member_count + v_delta WHERE id = v_hh;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'compteur de membres : foyer introuvable';
  END IF;
  PERFORM set_config('app.household_id', coalesce(v_prev, ''), true);
  RETURN NULL;
END
$$;
ALTER FUNCTION lc.membership_count_trg() OWNER TO lc_definer;
REVOKE ALL ON FUNCTION lc.membership_count_trg() FROM PUBLIC;

CREATE TRIGGER membership_protect_owner BEFORE DELETE ON lc.membership
  FOR EACH ROW EXECUTE FUNCTION lc.membership_protect_owner();
CREATE TRIGGER membership_immutable BEFORE UPDATE ON lc.membership
  FOR EACH ROW EXECUTE FUNCTION lc.membership_immutable();
CREATE TRIGGER membership_count AFTER INSERT OR DELETE ON lc.membership
  FOR EACH ROW EXECUTE FUNCTION lc.membership_count_trg();

-- ---------------------------------------------------------------------------
-- lc.create_household(text) (ERD §4.3) — appelant : lc_app
-- ---------------------------------------------------------------------------

CREATE FUNCTION lc.create_household(p_name text) RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = pg_catalog, lc, pg_temp
AS $$
DECLARE
  v_user  uuid;
  v_hh    uuid;
  v_name  text;
  v_con   text;
  v_tries integer := 0;
BEGIN
  -- 1. Contexte d'abord : l'utilisateur de session, jamais un parametre.
  v_user := lc.current_user_id();
  IF v_user IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'LC001', MESSAGE = 'contexte utilisateur absent';
  END IF;

  -- 2. Le foyer cree est celui que la fonction genere ; un app.household_id
  -- pose par l'appelant est ecrase.
  v_hh := lc.uuidv7();
  PERFORM set_config('app.household_id', v_hh::text, true);

  -- 3. Deja membre (membership_definer_self_read).
  IF EXISTS (SELECT 1 FROM lc.membership WHERE user_id = v_user) THEN
    RAISE EXCEPTION USING ERRCODE = 'LC002', MESSAGE = 'deja membre d''un foyer';
  END IF;

  -- 4. Prenom copie (app_user_definer_self_read).
  SELECT u.name INTO v_name FROM lc_auth.app_user u WHERE u.id = v_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'LC001', MESSAGE = 'compte introuvable';
  END IF;

  -- 5. Foyer ; household_name_check refuse un nom hors bornes (23514).
  INSERT INTO lc.household (id, name) VALUES (v_hh, p_name);

  -- 6. Responsable ; le trigger porte member_count a 1. Une creation
  -- concurrente du meme compte bute sur membership_user_key : LC002.
  BEGIN
    INSERT INTO lc.membership (household_id, user_id, role, display_name)
      VALUES (v_hh, v_user, 'owner', v_name);
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    IF v_con = 'membership_user_key' THEN
      RAISE EXCEPTION USING ERRCODE = 'LC002', MESSAGE = 'deja membre d''un foyer';
    END IF;
    RAISE;
  END;

  -- 7. Code d'invitation, nouvel essai sur collision (5 au plus).
  LOOP
    v_tries := v_tries + 1;
    BEGIN
      INSERT INTO lc.invite_code (household_id, code) VALUES (v_hh, lc.new_invite_code());
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
      IF v_con <> 'invite_code_code_key' THEN
        RAISE;
      END IF;
      IF v_tries >= 5 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'code d''invitation : collisions repetees';
      END IF;
    END;
  END LOOP;

  -- 8. Contexte remis a vide.
  PERFORM set_config('app.household_id', '', true);
END
$$;
ALTER FUNCTION lc.create_household(text) OWNER TO lc_definer;
REVOKE ALL ON FUNCTION lc.create_household(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lc.create_household(text) TO lc_app;

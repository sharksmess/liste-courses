-- 0007 — Article : proprietaire, RLS, privileges, compteur et ajout (ERD §1, §3.5,
-- §4.1, §4.8, §4.9, §5 ; ADR-0005). Ecrite a la main (drizzle-kit generate --custom).
-- La table lc.item vient de 0006 ; household.item_count et ses deux CHECK existent
-- depuis 0002.

ALTER TABLE lc.item OWNER TO lc_owner;

ALTER TABLE lc.item ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc.item FORCE  ROW LEVEL SECURITY;

REVOKE ALL ON lc.item FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Privileges (matrice ERD §1)
-- ---------------------------------------------------------------------------

GRANT SELECT, DELETE ON lc.item TO lc_app;
GRANT UPDATE (purchased) ON lc.item TO lc_app;
GRANT SELECT, INSERT ON lc.item TO lc_definer;

-- ---------------------------------------------------------------------------
-- Politiques
-- ---------------------------------------------------------------------------

CREATE POLICY item_member_select ON lc.item
  FOR SELECT TO lc_app USING (household_id = (SELECT lc.current_household_id()));
CREATE POLICY item_member_update ON lc.item
  FOR UPDATE TO lc_app
  USING (household_id = (SELECT lc.current_household_id()))
  WITH CHECK (household_id = (SELECT lc.current_household_id()));
CREATE POLICY item_member_delete ON lc.item
  FOR DELETE TO lc_app USING (household_id = (SELECT lc.current_household_id()));
-- Necessaire a INSERT ... RETURNING dans add_item.
CREATE POLICY item_definer_select ON lc.item
  FOR SELECT TO lc_definer USING (household_id = lc.context_household_id());
CREATE POLICY item_definer_insert ON lc.item
  FOR INSERT TO lc_definer WITH CHECK (household_id = lc.context_household_id());

-- ---------------------------------------------------------------------------
-- Trigger de compteur (ERD §4.9)
-- ---------------------------------------------------------------------------

-- Compteur d'articles : suit toute insertion et toute suppression, y compris un
-- DELETE direct de lc_app. SECURITY DEFINER : aucun role appelant n'a UPDATE sur
-- les compteurs. L'UPDATE verrouille la ligne du foyer : les ajouts concurrents
-- se serialisent, et household_item_limit porte la borne (ERD §5).
CREATE FUNCTION lc.item_count_trg() RETURNS trigger
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
  UPDATE lc.household SET item_count = item_count + v_delta WHERE id = v_hh;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'compteur d''articles : foyer introuvable';
  END IF;
  PERFORM set_config('app.household_id', coalesce(v_prev, ''), true);
  RETURN NULL;
END
$$;
ALTER FUNCTION lc.item_count_trg() OWNER TO lc_definer;
REVOKE ALL ON FUNCTION lc.item_count_trg() FROM PUBLIC;

CREATE TRIGGER item_count AFTER INSERT OR DELETE ON lc.item
  FOR EACH ROW EXECUTE FUNCTION lc.item_count_trg();

-- ---------------------------------------------------------------------------
-- lc.add_item(text, text) (ERD §4.8) — appelant : lc_app
-- ---------------------------------------------------------------------------

CREATE FUNCTION lc.add_item(p_name text, p_quantity text) RETURNS uuid
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = pg_catalog, lc, pg_temp
AS $$
DECLARE
  v_user uuid;
  v_hh   uuid;
  v_name text;
  v_id   uuid;
  v_con  text;
BEGIN
  -- 1. Contexte d'abord : l'utilisateur de session, jamais un parametre ; un
  -- app.household_id pose par l'appelant est ecrase, jamais lu.
  v_user := lc.current_user_id();
  IF v_user IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'LC001', MESSAGE = 'contexte utilisateur absent';
  END IF;
  PERFORM set_config('app.household_id', '', true);

  -- 2. Foyer et prenom de l'appelant (membership_definer_self_read).
  SELECT m.household_id, m.display_name INTO v_hh, v_name FROM lc.membership m WHERE m.user_id = v_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'LC009', MESSAGE = 'aucun foyer';
  END IF;

  -- 3. Valeur de confiance : le foyer de l'appelant.
  PERFORM set_config('app.household_id', v_hh::text, true);

  -- 4. Le trigger incremente item_count sous le verrou de la ligne du foyer.
  -- Seule la borne devient LC008 ; toute autre contrainte est relevee telle quelle.
  BEGIN
    INSERT INTO lc.item (household_id, name, quantity, author_user_id, author_name)
      VALUES (v_hh, p_name, p_quantity, v_user, v_name)
      RETURNING id INTO v_id;
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    IF v_con = 'household_item_limit' THEN
      RAISE EXCEPTION USING ERRCODE = 'LC008', MESSAGE = 'liste pleine';
    END IF;
    RAISE;
  END;

  -- 5. Contexte remis a vide.
  PERFORM set_config('app.household_id', '', true);
  RETURN v_id;
END
$$;
ALTER FUNCTION lc.add_item(text, text) OWNER TO lc_definer;
REVOKE ALL ON FUNCTION lc.add_item(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lc.add_item(text, text) TO lc_app;

-- 0001 — Roles, privileges par defaut, fonctions de contexte (ERD §1, §2, §4.10 ; ADR-0005).
-- Ecrite a la main (drizzle-kit generate --custom). Aucun mot de passe : l'humain
-- (local) et la CI (TEST_ROLE_PASSWORDS) les posent.

-- 1. Roles : creation idempotente, puis attributs reimposes sans condition.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lc_owner') THEN
    CREATE ROLE lc_owner;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lc_app') THEN
    CREATE ROLE lc_app;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lc_better_auth') THEN
    CREATE ROLE lc_better_auth;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lc_definer') THEN
    CREATE ROLE lc_definer;
  END IF;
END
$$;

ALTER ROLE lc_owner       NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOLOGIN;
ALTER ROLE lc_app         NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS LOGIN;
ALTER ROLE lc_better_auth NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS LOGIN;
ALTER ROLE lc_definer     NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOLOGIN;

-- 2. Assertion (lecon Signet 0010, 0011) : aucune appartenance de role dans un
-- sens ou dans l'autre, aucun reglage par role. On leve sans rien revoquer :
-- l'etat inattendu est a examiner par un humain.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_auth_members m
      JOIN pg_roles r ON r.oid = m.roleid OR r.oid = m.member
     WHERE r.rolname IN ('lc_owner', 'lc_app', 'lc_better_auth', 'lc_definer')
  ) THEN
    RAISE EXCEPTION 'un role lc_* est membre d''un role, ou un role est membre d''un role lc_* : a examiner';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM pg_db_role_setting s
      JOIN pg_roles r ON r.oid = s.setrole
     WHERE r.rolname IN ('lc_owner', 'lc_app', 'lc_better_auth', 'lc_definer')
  ) THEN
    RAISE EXCEPTION 'un reglage par role existe pour un role lc_* : a examiner';
  END IF;
END
$$;

-- 3. Privileges par defaut : sans FOR ROLE ni IN SCHEMA (rules/drizzle-postgres.md,
-- point 5). S'applique au role qui execute les migrations, qui cree les fonctions
-- avant de les ceder.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

REVOKE ALL ON SCHEMA lc, lc_auth FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

ALTER SCHEMA lc OWNER TO lc_owner;
ALTER SCHEMA lc_auth OWNER TO lc_owner;

GRANT USAGE ON SCHEMA lc TO lc_app, lc_better_auth, lc_definer;
GRANT USAGE ON SCHEMA lc_auth TO lc_better_auth, lc_definer;

-- 4. lc.uuidv7() (ERD §0, §4.10) : horodatage milliseconde sur 48 bits, puis
-- les octets aleatoires de gen_random_uuid() (natif depuis Postgres 13), dont
-- la variante RFC 4122 est deja posee ; version forcee a 7.
CREATE FUNCTION lc.uuidv7() RETURNS uuid
  LANGUAGE plpgsql
  VOLATILE
  SET search_path = pg_catalog, lc, pg_temp
AS $$
DECLARE
  v_ms    bigint := floor(extract(epoch FROM clock_timestamp()) * 1000);
  v_bytes bytea  := uuid_send(gen_random_uuid());
BEGIN
  v_bytes := overlay(v_bytes PLACING substring(int8send(v_ms) FROM 3) FROM 1 FOR 6);
  v_bytes := set_byte(v_bytes, 6, (get_byte(v_bytes, 6) & 15) | 112);
  RETURN encode(v_bytes, 'hex')::uuid;
END
$$;
ALTER FUNCTION lc.uuidv7() OWNER TO lc_owner;
REVOKE ALL ON FUNCTION lc.uuidv7() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lc.uuidv7() TO lc_app, lc_better_auth, lc_definer;

-- 5. lc.current_user_id() (ERD §2) : utilisateur de session pose par le serveur
-- (set_config('app.user_id', ..., true)). Absent ou vide : NULL. Une valeur qui
-- n'est pas un UUID fait lever le cast (22P02), jamais une ligne.
CREATE FUNCTION lc.current_user_id() RETURNS uuid
  LANGUAGE sql
  STABLE
  SET search_path = pg_catalog, lc, pg_temp
AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;
ALTER FUNCTION lc.current_user_id() OWNER TO lc_owner;
REVOKE ALL ON FUNCTION lc.current_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lc.current_user_id() TO lc_app, lc_definer;

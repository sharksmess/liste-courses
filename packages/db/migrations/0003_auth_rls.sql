-- 0003 — Tables de better-auth : proprietaire, RLS forcee, privileges (ERD §1, §3.1).
-- Ecrite a la main (drizzle-kit generate --custom).

ALTER TABLE lc_auth.app_user     OWNER TO lc_owner;
ALTER TABLE lc_auth.session      OWNER TO lc_owner;
ALTER TABLE lc_auth.account      OWNER TO lc_owner;
ALTER TABLE lc_auth.verification OWNER TO lc_owner;

ALTER TABLE lc_auth.app_user     ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_auth.app_user     FORCE  ROW LEVEL SECURITY;
ALTER TABLE lc_auth.session      ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_auth.session      FORCE  ROW LEVEL SECURITY;
ALTER TABLE lc_auth.account      ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_auth.account      FORCE  ROW LEVEL SECURITY;
ALTER TABLE lc_auth.verification ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_auth.verification FORCE  ROW LEVEL SECURITY;

-- Rien pour PUBLIC (les tables neuves n'accordent rien, revocation explicite
-- par precaution).
REVOKE ALL ON lc_auth.app_user, lc_auth.session, lc_auth.account, lc_auth.verification FROM PUBLIC;

-- lc_better_auth : borne par ses privileges (quatre tables), pas par ligne :
-- l'authentification precede tout contexte.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON lc_auth.app_user, lc_auth.session, lc_auth.account, lc_auth.verification
  TO lc_better_auth;

CREATE POLICY app_user_better_auth_all ON lc_auth.app_user
  FOR ALL TO lc_better_auth USING (true) WITH CHECK (true);
CREATE POLICY session_better_auth_all ON lc_auth.session
  FOR ALL TO lc_better_auth USING (true) WITH CHECK (true);
CREATE POLICY account_better_auth_all ON lc_auth.account
  FOR ALL TO lc_better_auth USING (true) WITH CHECK (true);
CREATE POLICY verification_better_auth_all ON lc_auth.verification
  FOR ALL TO lc_better_auth USING (true) WITH CHECK (true);

-- lc_definer : lecture du seul prenom de l'appelant, pour le copier dans
-- membership.display_name (ERD §4.3, point 4).
GRANT SELECT (id, name) ON lc_auth.app_user TO lc_definer;
CREATE POLICY app_user_definer_self_read ON lc_auth.app_user
  FOR SELECT TO lc_definer USING (id = lc.current_user_id());

-- lc_app : aucun privilege, aucune politique (ni USAGE sur lc_auth, 0001).

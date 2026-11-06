/**
 * Helpers de la tranche 004 : client des trois routes de membres, lectures de
 * verification en base (administration, TOUJOURS filtrees par des identifiants
 * crees par le test) et transactions `lc_app` pour les scenarios deterministes.
 *
 * Routes lues depuis le contrat (docs/02-architecture/api-contracts/members.ts).
 *
 * Marqueurs d'ecran imposes a l'implementeur (HTML rendu de /household) :
 *   <ul data-testid="member-list">                      liste des membres
 *   <li data-testid="member-row" data-role="owner|member">  un par membre, prenom visible
 *   bouton « Retirer » dans chaque ligne de membre (page de la responsable, jamais sur sa ligne)
 *   bouton « Quitter le foyer » (page d'un membre, jamais celle de la responsable)
 */
import { z } from "zod";
import { leaveHousehold, listMembers, removeMember } from "../../docs/02-architecture/api-contracts/members";
import { adminPool } from "./db";
import { describeResult, expectStatus, type HttpResult } from "./http";
import { send, type ItemResult } from "./items";
import { membershipsOfUser } from "./household";

export function getMembers(cookie?: string): Promise<ItemResult> {
  return send("GET", listMembers.route, { cookie });
}

export function memberPath(memberId: string): string {
  return removeMember.route.replace(":memberId", encodeURIComponent(memberId));
}

export function deleteMemberAs(memberId: string, cookie?: string): Promise<ItemResult> {
  return send("DELETE", memberPath(memberId), { cookie });
}

export function postLeave(cookie?: string): Promise<ItemResult> {
  return send("POST", leaveHousehold.route, { cookie, json: {} });
}

export interface ApiMember {
  memberId: string;
  name: string;
  role: "owner" | "member";
}

const MemberList = z.object({ members: z.array(z.object({ memberId: z.string(), name: z.string(), role: z.enum(["owner", "member"]) })) });

/** Verifie un 200 conforme, sans aucune cle en trop, et rend les membres dans l'ordre recu. */
export function expectMembers(r: HttpResult, label: string): ApiMember[] {
  expectStatus(r, 200, label);
  const parsed = MemberList.safeParse(r.body);
  if (!parsed.success) throw new Error(`${describeResult(`${label} : corps non conforme a { members: Member[] }`, r)} ; ${parsed.error.message}`);
  const raw = r.body as { members: Record<string, unknown>[] };
  if (Object.keys(raw).join() !== "members") throw new Error(describeResult(`${label} : cles inattendues au sommet`, r));
  for (const m of raw.members) {
    if (Object.keys(m).sort().join() !== "memberId,name,role") throw new Error(describeResult(`${label} : cles d'un membre : ${Object.keys(m).join()}`, r));
  }
  return parsed.data.members;
}

/** Identifiant de la ligne d'appartenance (lc.membership.id) d'un compte. */
export async function membershipIdOf(userId: string): Promise<string> {
  const id = (await membershipsOfUser(userId))[0]?.id;
  if (!id) throw new Error(`[tests] le compte ${userId} n'a aucune appartenance`);
  return id;
}

/** Lignes d'appartenance d'un foyer, dans l'ordre d'entree (joined_at, id). */
export async function membershipRowsOf(householdId: string): Promise<{ id: string; user_id: string; role: string; display_name: string }[]> {
  const r = await adminPool().query<{ id: string; user_id: string; role: string; display_name: string }>(
    "SELECT id, user_id, role, display_name FROM lc.membership WHERE household_id = $1 ORDER BY joined_at, id",
    [householdId],
  );
  return r.rows;
}

/** Identifiant bien forme qu'aucune appartenance ne porte. */
export function unknownMemberId(): string {
  return crypto.randomUUID();
}

/**
 * Attend (sondage court, borne) qu'une session AUTRE que `excludePid` soit bloquee
 * sur un verrou en executant une requete dont le texte correspond a `queryLike`
 * (motif SQL LIKE). Sert quand la connexion appartient au serveur (requete HTTP) :
 * son `pid` n'est pas connu du test. Echoue avec le dernier etat observe au delai.
 */
export async function waitUntilQueryBlocked(queryLike: string, excludePid: number, timeoutMs = 10_000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let last = "aucune session ne correspond";
  while (Date.now() < deadline) {
    const r = await adminPool().query<{ pid: number; wait_event_type: string | null; state: string; query: string }>(
      "SELECT pid, wait_event_type, state, left(query, 120) AS query FROM pg_stat_activity " +
        "WHERE datname = current_database() AND pid <> $1 AND pid <> pg_backend_pid() AND query LIKE $2",
      [excludePid, queryLike],
    );
    last = JSON.stringify(r.rows);
    const blocked = r.rows.find((x) => x.wait_event_type === "Lock");
    if (blocked) return blocked.pid;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`[tests] aucune session executant "${queryLike}" n'est bloquee sur un verrou apres ${timeoutMs} ms ; derniers etats : ${last}`);
}

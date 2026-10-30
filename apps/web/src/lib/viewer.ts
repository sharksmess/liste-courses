/**
 * Etat de l'utilisateur pour les pages (Server Components) : meme couche de
 * service et meme ordre que les Route Handlers (ADR-0006) — session, puis foyer
 * relu en base a chaque requete (ADR-0003, B2).
 */
import { headers } from "next/headers";
import { getSessionUser, type SessionUser } from "./auth";
import { findHousehold, type HouseholdSummary } from "./household";

export interface Viewer {
  user: SessionUser;
  household: HouseholdSummary | null;
}

export async function currentViewer(): Promise<Viewer | null> {
  const user = await getSessionUser(await headers());
  if (!user) return null;
  return { user, household: await findHousehold(user.id) };
}

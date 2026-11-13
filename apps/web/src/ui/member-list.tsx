"use client";

/**
 * Membres du foyer (US-10, US-12) : prenom, responsable designee, et « Retirer »
 * pour la responsable, par `fetch`, puis `router.refresh()`. Props : `memberId`,
 * `name`, `role`, jamais d'identifiant de compte ni d'adresse (rules/nextjs.md).
 * Le message d'erreur est tenu au niveau de la liste : le rechargement retire la
 * ligne d'un membre deja parti, et un message porte par la ligne disparaitrait
 * avec elle.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Member } from "@/lib/members";
import { memberMutationEffect } from "./messages";
import { sendJson } from "./requests";

export function MemberList({ members, canRemove }: { members: Member[]; canRemove: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function remove(memberId: string) {
    setPendingId(memberId);
    setError(null);
    const outcome = await sendJson("DELETE", `/api/household/members/${encodeURIComponent(memberId)}`);
    setPendingId(null);
    const effect = memberMutationEffect(outcome);
    setError(effect.message);
    if (effect.refresh) router.refresh();
  }

  return (
    <>
      {error && <p role="alert">{error}</p>}
      <ul data-testid="member-list">
        {members.map((member) => (
          <li key={member.memberId} data-testid="member-row" data-role={member.role}>
            {member.name}
            {member.role === "owner" && <span> (responsable)</span>}
            {canRemove && member.role === "member" && (
              <>
                {" "}
                <button type="button" disabled={pendingId === member.memberId} onClick={() => void remove(member.memberId)}>
                  Retirer
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

"use client";

/**
 * Bouton « Quitter le foyer » (US-13) : POST /api/household/leave. Apres un depart
 * reussi, la page « sans foyer » ; un refus suit `memberMutationEffect`.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { z } from "zod";
import type { leaveHousehold } from "@/lib/contracts";
import { memberMutationEffect } from "./messages";
import { postJson } from "./requests";

/** Corps de POST, sur l'entree du contrat : vide. */
type LeaveBody = z.input<typeof leaveHousehold.input>;

export function LeaveHouseholdButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    setError(null);
    const body: LeaveBody = {};
    const outcome = await postJson("/api/household/leave", body);
    setPending(false);
    if (outcome.ok) {
      router.push("/no-household");
      return;
    }
    const effect = memberMutationEffect(outcome);
    setError(effect.message);
    if (effect.refresh) router.refresh();
  }

  return (
    <>
      {error && <p role="alert">{error}</p>}
      <button type="button" disabled={pending} onClick={() => void onClick()}>
        Quitter le foyer
      </button>
    </>
  );
}

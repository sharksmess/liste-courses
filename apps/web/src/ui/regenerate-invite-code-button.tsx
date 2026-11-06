"use client";

/**
 * Bouton de regeneration du code (US-11.3) : POST /api/household/invite-code,
 * puis `router.refresh()`. Le code n'est ni recu en prop ni lu dans la reponse :
 * il reste rendu par le Server Component de la page (rules/nextjs.md).
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { messageFor } from "./messages";
import { postJson } from "./requests";

export function RegenerateInviteCodeButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    setError(null);
    const outcome = await postJson("/api/household/invite-code", {});
    setPending(false);
    if (outcome.ok) {
      router.refresh();
      return;
    }
    setError(messageFor(outcome.status, outcome.code));
  }

  return (
    <>
      {error && <p role="alert">{error}</p>}
      <button type="button" data-testid="regenerate-invite-code" disabled={pending} onClick={() => void onClick()}>
        Regenerer le code
      </button>
    </>
  );
}

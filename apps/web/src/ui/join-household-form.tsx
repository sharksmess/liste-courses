"use client";

/** Formulaire « rejoindre avec un code » (US-05) : POST /api/household/join. */
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { messageFor } from "./messages";
import { formText, postJson } from "./requests";

export function JoinHouseholdForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = formText(new FormData(event.currentTarget), "code");
    setPending(true);
    setError(null);
    const outcome = await postJson("/api/household/join", { code });
    if (outcome.ok || outcome.code === "ALREADY_IN_HOUSEHOLD") {
      router.push("/household");
      router.refresh();
      return;
    }
    setPending(false);
    // Un code mal forme et un code refuse recoivent le meme message neutre.
    setError(messageFor(outcome.status, outcome.code === "VALIDATION_FAILED" ? "INVITE_CODE_INVALID" : outcome.code));
  }

  return (
    <form data-testid="join-household-form" onSubmit={(event) => void onSubmit(event)}>
      <p>
        <label htmlFor="invite-code">Code d&apos;invitation</label>
        <br />
        <input id="invite-code" name="code" type="text" required autoComplete="off" spellCheck={false} />
      </p>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={pending}>
        Rejoindre
      </button>
    </form>
  );
}

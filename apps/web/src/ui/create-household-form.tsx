"use client";

/** Formulaire « creer un foyer » (US-03) : POST /api/household. */
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { messageFor } from "./messages";
import { formText, postJson } from "./requests";

export function CreateHouseholdForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = formText(new FormData(event.currentTarget), "name");
    setPending(true);
    setError(null);
    const outcome = await postJson("/api/household", { name });
    if (outcome.ok || outcome.code === "ALREADY_IN_HOUSEHOLD") {
      router.push("/household");
      router.refresh();
      return;
    }
    setPending(false);
    setError(messageFor(outcome.status, outcome.code));
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)}>
      <p>
        <label htmlFor="household-name">Nom du foyer (1 a 50 caracteres)</label>
        <br />
        <input id="household-name" name="name" type="text" required maxLength={100} />
      </p>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={pending}>
        Creer le foyer
      </button>
    </form>
  );
}

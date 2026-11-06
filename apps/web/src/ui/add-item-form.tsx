"use client";

/** Formulaire d'ajout (US-07) : POST /api/household/items, puis rechargement de la liste. */
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { z } from "zod";
import type { addItem } from "@/lib/contracts";
import { messageFor } from "./messages";
import { formText, postJson } from "./requests";

/** Corps de POST, sur l'entree du contrat : une faute de cle echoue a la compilation. */
type AddItemBody = z.input<typeof addItem.input>;

export function AddItemForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true);
    setError(null);
    const body: AddItemBody = { name: formText(data, "name"), quantity: formText(data, "quantity") };
    const outcome = await postJson("/api/household/items", body);
    setPending(false);
    if (outcome.ok) {
      form.reset();
      router.refresh();
      return;
    }
    setError(messageFor(outcome.status, outcome.code));
  }

  return (
    <form data-testid="add-item-form" onSubmit={(event) => void onSubmit(event)}>
      <p>
        <label htmlFor="item-name">Article (100 caracteres au plus)</label>
        <br />
        <input id="item-name" name="name" type="text" required autoComplete="off" />
      </p>
      <p>
        <label htmlFor="item-quantity">Quantite, facultative (30 caracteres au plus)</label>
        <br />
        <input id="item-quantity" name="quantity" type="text" autoComplete="off" />
      </p>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={pending}>
        Ajouter
      </button>
    </form>
  );
}

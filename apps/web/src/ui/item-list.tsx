"use client";

/**
 * Liste du foyer (US-06, US-08, US-09) : cases a cocher et suppression par
 * `fetch`, puis `router.refresh()`. Le message d'erreur est tenu ici, au niveau
 * de la liste : sur ITEM_NOT_FOUND, le rechargement retire la ligne, et un
 * message porte par la ligne disparaitrait avec elle.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Item } from "@/lib/items";
import { messageFor } from "./messages";
import { sendJson } from "./requests";

export function ItemList({ items }: { items: Item[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function mutate(itemId: string, method: "PATCH" | "DELETE", payload?: { purchased: boolean }) {
    setPendingId(itemId);
    setError(null);
    const outcome = await sendJson(method, `/api/household/items/${encodeURIComponent(itemId)}`, payload);
    setPendingId(null);
    if (!outcome.ok) setError(messageFor(outcome.status, outcome.code));
    if (outcome.ok || outcome.code === "ITEM_NOT_FOUND") router.refresh();
  }

  return (
    <>
      {error && <p role="alert">{error}</p>}
      <ul data-testid="item-list">
        {items.map((item) => (
          <li key={item.id} data-testid="item-row" data-purchased={String(item.purchased)}>
            <label>
              <input
                type="checkbox"
                checked={item.purchased}
                disabled={pendingId === item.id}
                onChange={(event) => void mutate(item.id, "PATCH", { purchased: event.target.checked })}
              />{" "}
              {item.name}
            </label>
            {item.quantity && <span> ({item.quantity})</span>}
            <span> ajoute par {item.addedBy.name}</span>{" "}
            <button type="button" disabled={pendingId === item.id} onClick={() => void mutate(item.id, "DELETE")}>
              Supprimer
            </button>
          </li>
        ))}
      </ul>
      {items.length === 0 && <p>La liste est vide.</p>}
    </>
  );
}

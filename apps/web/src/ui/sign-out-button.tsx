"use client";

/** Deconnexion (US-02.4) : ferme la session better-auth puis revient a la connexion. */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "./requests";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    await postJson("/api/auth/sign-out", {});
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <button type="button" onClick={() => void onClick()} disabled={pending}>
      Se deconnecter
    </button>
  );
}

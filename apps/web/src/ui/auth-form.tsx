"use client";

/**
 * Formulaires d'inscription et de connexion (US-01, US-02). Appellent les routes
 * better-auth ; le prenom est valide cote serveur (hook, contrat `signUp`).
 */
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { messageFor } from "./messages";
import { formText, postJson } from "./requests";

export function AuthForm({ mode }: { mode: "sign-up" | "sign-in" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = formText(data, "email");
    const password = formText(data, "password");
    setPending(true);
    setError(null);
    const outcome =
      mode === "sign-up"
        ? await postJson("/api/auth/sign-up/email", { email, password, name: formText(data, "name") })
        : await postJson("/api/auth/sign-in/email", { email, password });
    if (outcome.ok) {
      router.push("/");
      router.refresh();
      return;
    }
    setPending(false);
    setError(messageFor(outcome.status, outcome.code));
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)}>
      {mode === "sign-up" && (
        <p>
          <label htmlFor="name">Prenom</label>
          <br />
          <input id="name" name="name" type="text" required maxLength={60} autoComplete="given-name" />
        </p>
      )}
      <p>
        <label htmlFor="email">Adresse e-mail</label>
        <br />
        <input id="email" name="email" type="email" required autoComplete="email" />
      </p>
      <p>
        <label htmlFor="password">Mot de passe (8 a 128 caracteres)</label>
        <br />
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          maxLength={128}
          autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
        />
      </p>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={pending}>
        {mode === "sign-up" ? "Creer mon compte" : "Se connecter"}
      </button>
    </form>
  );
}

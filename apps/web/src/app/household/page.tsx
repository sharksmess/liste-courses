import { redirect } from "next/navigation";
import { getInviteCode } from "@/lib/invite-code";
import { currentViewer } from "@/lib/viewer";
import { RegenerateInviteCodeButton } from "@/ui/regenerate-invite-code-button";
import { SignOutButton } from "@/ui/sign-out-button";

/** Code du foyer, responsable seule (US-11) : rendu ici, jamais passe a un composant client. */
async function InviteCodeSection({ userId }: { userId: string }) {
  const invite = await getInviteCode(userId);
  // Le role vient d'etre lu `owner` et une appartenance est immuable : invariant rompu.
  if (!invite.ok) throw new Error("code d'invitation illisible pour la responsable");

  return (
    <section>
      <h2>Code d&apos;invitation</h2>
      <p>
        <code data-testid="invite-code">{invite.value.code}</code>
      </p>
      <RegenerateInviteCodeButton />
    </section>
  );
}

/** Page du foyer : nom, code pour la responsable, liste (vide jusqu'a la tranche 003). */
export default async function HouseholdPage() {
  const viewer = await currentViewer();
  if (!viewer) redirect("/sign-in");
  if (!viewer.household) redirect("/no-household");

  return (
    <main>
      <h1>{viewer.household.name}</h1>
      <p>
        Connecte en tant que {viewer.user.name} ({viewer.household.role === "owner" ? "responsable" : "membre"})
      </p>
      {viewer.household.role === "owner" && <InviteCodeSection userId={viewer.user.id} />}
      <h2>Liste de courses</h2>
      <ul data-testid="item-list"></ul>
      <p>La liste est vide.</p>
      <SignOutButton />
    </main>
  );
}

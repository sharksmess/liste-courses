import { redirect } from "next/navigation";
import { currentViewer } from "@/lib/viewer";
import { CreateHouseholdForm } from "@/ui/create-household-form";
import { SignOutButton } from "@/ui/sign-out-button";

/** US-04 : compte connecte sans foyer. Rejoindre par code arrive en tranche 002. */
export default async function NoHouseholdPage() {
  const viewer = await currentViewer();
  if (!viewer) redirect("/sign-in");
  if (viewer.household) redirect("/household");

  return (
    <main>
      <h1>Bonjour {viewer.user.name}</h1>
      <p>Vous n&apos;appartenez a aucun foyer.</p>
      <section>
        <h2>Creer un foyer</h2>
        <CreateHouseholdForm />
      </section>
      <section>
        <h2>Rejoindre avec un code</h2>
        <p>Bientot disponible : vous pourrez rejoindre un foyer avec le code que sa responsable vous transmet.</p>
        <fieldset disabled>
          <label htmlFor="invite-code">Code d&apos;invitation</label>
          <br />
          <input id="invite-code" name="code" type="text" disabled />
          <button type="button" disabled>
            Rejoindre
          </button>
        </fieldset>
      </section>
      <SignOutButton />
    </main>
  );
}

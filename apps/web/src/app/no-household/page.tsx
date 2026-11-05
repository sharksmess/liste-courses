import { redirect } from "next/navigation";
import { currentViewer } from "@/lib/viewer";
import { CreateHouseholdForm } from "@/ui/create-household-form";
import { JoinHouseholdForm } from "@/ui/join-household-form";
import { SignOutButton } from "@/ui/sign-out-button";

/** US-04 : compte connecte sans foyer ; il en cree un ou en rejoint un par code. */
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
        <JoinHouseholdForm />
      </section>
      <SignOutButton />
    </main>
  );
}

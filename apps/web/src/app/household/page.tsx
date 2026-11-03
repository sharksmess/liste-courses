import { redirect } from "next/navigation";
import { currentViewer } from "@/lib/viewer";
import { SignOutButton } from "@/ui/sign-out-button";

/** Page du foyer : nom et liste (vide en tranche 001 ; articles en tranche 003). */
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
      <h2>Liste de courses</h2>
      <ul data-testid="item-list"></ul>
      <p>La liste est vide.</p>
      <SignOutButton />
    </main>
  );
}

import { redirect } from "next/navigation";
import { currentViewer } from "@/lib/viewer";

/** Aiguillage : connexion sans session, page « sans foyer », ou page du foyer. */
export default async function Home() {
  const viewer = await currentViewer();
  if (!viewer) redirect("/sign-in");
  redirect(viewer.household ? "/household" : "/no-household");
}

import Link from "next/link";
import { AuthForm } from "@/ui/auth-form";

export default function SignInPage() {
  return (
    <main>
      <h1>Connexion</h1>
      <AuthForm mode="sign-in" />
      <p>
        Pas encore de compte ? <Link href="/sign-up">Creer un compte</Link>
      </p>
    </main>
  );
}

import Link from "next/link";
import { AuthForm } from "@/ui/auth-form";

export default function SignUpPage() {
  return (
    <main>
      <h1>Inscription</h1>
      <AuthForm mode="sign-up" />
      <p>
        Deja un compte ? <Link href="/sign-in">Se connecter</Link>
      </p>
    </main>
  );
}

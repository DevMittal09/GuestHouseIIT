import { redirect } from "next/navigation";
import { AuthMasthead } from "@/components/auth-masthead";
import { LoginForm } from "@/components/login-form";
import { DEMO_PASSWORD, getCurrentUser } from "@/lib/auth";
import { homeForRole } from "@/lib/routes";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(homeForRole(user.role));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-4 py-12">
      <AuthMasthead subtitle="Bageshri &amp; Hamsanandi" />
      <LoginForm demoPassword={DEMO_PASSWORD} />
    </main>
  );
}

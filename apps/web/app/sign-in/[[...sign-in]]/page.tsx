import { SignIn } from "@clerk/nextjs";
import { Suspense } from "react";

// Clerk's default look on a plain page (§13). <SignIn /> reads the URL on a
// catch-all route, so it renders inside <Suspense> under Cache Components.
export default function SignInPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Suspense>
        <SignIn />
      </Suspense>
    </main>
  );
}

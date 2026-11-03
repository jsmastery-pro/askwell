import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react";

// Clerk's default look on a plain page (§13). <SignUp /> reads the URL on a
// catch-all route, so it renders inside <Suspense> under Cache Components.
export default function SignUpPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Suspense>
        <SignUp />
      </Suspense>
    </main>
  );
}

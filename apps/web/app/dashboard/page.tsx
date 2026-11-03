import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";
import { Spinner } from "@/components/ui";

// Placeholder that proves the auth flow. B4 replaces it with the real layout.

async function SignedIn() {
  // The proxy already redirects signed-out requests; the page checks too.
  await auth.protect();
  return (
    <div className="flex items-center gap-3">
      <p>Signed in</p>
      <UserButton />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Suspense fallback={<Spinner />}>
        <SignedIn />
      </Suspense>
    </main>
  );
}

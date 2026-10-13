import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex w-full flex-1 items-center justify-center py-10">
      <SignIn fallbackRedirectUrl="/dashboard" />
    </div>
  );
}

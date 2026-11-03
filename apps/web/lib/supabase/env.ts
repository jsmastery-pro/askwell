// Supabase environment variables, read and checked at call time (project.md
// §11), so a missing value fails with a clear error instead of an undefined URL.
//
// The secret key is deliberately NOT read here: service.ts is the only file
// that may name or read it (a lint rule enforces it).

/** A required environment variable is missing or empty. */
export class MissingEnvError extends Error {
  readonly variable: string;

  constructor(variable: string) {
    super(`Missing environment variable ${variable}. Set it in .env (local) or in Vercel.`);
    this.name = "MissingEnvError";
    this.variable = variable;
  }
}

/** Returns `value`, or throws MissingEnvError naming `name` when it's unset or blank. */
export function requireEnv(name: string, value: string | undefined): string {
  if (value === undefined || value.trim() === "") throw new MissingEnvError(name);
  return value;
}

/** The Supabase project URL and publishable key (public by design: RLS is the boundary). */
export function supabasePublicEnv(): { url: string; publishableKey: string } {
  // Literal process.env reads, so Next can inline NEXT_PUBLIC_* values.
  return {
    url: requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    publishableKey: requireEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  };
}

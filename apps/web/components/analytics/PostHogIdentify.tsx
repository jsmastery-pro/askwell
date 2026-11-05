"use client";

import { useAuth } from "@clerk/nextjs";
import posthog from "posthog-js";
import { useEffect } from "react";

type IdentityClient = Pick<typeof posthog, "__loaded" | "get_property" | "get_distinct_id" | "identify" | "reset">;

/**
 * Brings PostHog's person in line with the Clerk session. Signed in: identify
 * by Clerk user ID only (no email or name), which merges the anonymous landing
 * visit into the account. Signed out: reset, so the next person on this
 * browser starts anonymous. Does nothing where PostHog isn't initialized.
 */
export function syncIdentity(client: IdentityClient, userId: string | null | undefined): void {
  if (!client.__loaded) return;
  const identified = client.get_property("$user_state") === "identified";

  if (!userId) {
    if (identified) client.reset();
    return;
  }
  if (client.get_distinct_id() === userId) return;
  // Another account was identified on this browser: start a fresh person.
  if (identified) client.reset();
  client.identify(userId);
}

/** Keeps PostHog in step with Clerk on every page (project.md §6.11). */
export function PostHogIdentify() {
  const { isLoaded, userId } = useAuth();

  useEffect(() => {
    if (isLoaded) syncIdentity(posthog, userId);
  }, [isLoaded, userId]);

  return null;
}

import { clerkMiddleware } from "@clerk/nextjs/server";
import { routeAccess, SIGN_IN_PATH, SIGN_UP_PATH } from "./lib/auth/routes";
import { unauthorizedResponse } from "./lib/auth/responses";

// Next 16 calls middleware "proxy". Clerk reads the session here; signed-out
// requests to owner routes are stopped early (pages → sign-in, API → 401).
// Owner pages and handlers still check auth themselves.
export default clerkMiddleware(
  async (auth, req) => {
    const access = routeAccess(req.nextUrl.pathname);
    if (access === "public") return;

    const { isAuthenticated, redirectToSignIn } = await auth();
    if (isAuthenticated) return;

    if (access === "owner-api") return unauthorizedResponse();
    return redirectToSignIn({ returnBackUrl: req.url });
  },
  { signInUrl: SIGN_IN_PATH, signUpUrl: SIGN_UP_PATH },
);

export const config = {
  matcher: [
    // Skip Next internals and static files, unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};

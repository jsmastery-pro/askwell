import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { ERROR_CODES, type ApiError } from "@askwell/shared";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/api/projects(.*)",
  "/api/knowledge(.*)",
  "/api/conversations(.*)",
  "/api/billing(.*)",
]);

const isApiRoute = createRouteMatcher(["/api(.*)"]);

// Signed-out visitors go to our own sign-in/up pages, not Clerk's hosted ones,
// even where the NEXT_PUBLIC_CLERK_SIGN_*_URL env vars aren't set.
const AUTH_PAGES = { signInUrl: "/sign-in", signUpUrl: "/sign-up" };

export default clerkMiddleware(async (auth, req) => {
  if (!isProtectedRoute(req)) return;

  // API callers get a JSON 401, not a redirect to the sign-in page.
  if (isApiRoute(req)) {
    const { userId } = await auth();
    if (!userId) {
      const body: ApiError = { error: { code: ERROR_CODES.unauthorized, message: "Sign in required." } };
      return Response.json(body, { status: 401 });
    }
    return;
  }

  await auth.protect();
}, AUTH_PAGES);

export const config = {
  matcher: [
    "/((?!_next|embed|api/widget|api/stripe/webhook|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/api/((?!widget|stripe/webhook).*)",
    "/__clerk/:path*",
  ],
};

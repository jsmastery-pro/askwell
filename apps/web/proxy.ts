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
});

export const config = {
  matcher: [
    "/((?!_next|api/widget|api/stripe/webhook|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/api/((?!widget|stripe/webhook).*)",
    "/__clerk/:path*",
  ],
};

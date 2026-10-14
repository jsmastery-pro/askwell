import Link from "next/link";
import { APP_NAME } from "@askwell/shared";
import { PROJECTS_PATH } from "../dashboard-nav/routes";
import { FONT_DISPLAY } from "../landing/fonts";
import { FOCUS_ON_INK } from "../ui/styles";

const STEPS = [
  { title: "Create a project", body: "One project per site or help center." },
  { title: "Add knowledge", body: "Upload your docs or paste an FAQ. The bot answers only from these." },
  { title: "Install the widget", body: "Paste one script tag into your site." },
  { title: "Get your first chat", body: "Visitors ask, the bot answers, and the chats show up here." },
];

/** The home for an account with no projects yet. */
export function GettingStarted() {
  return (
    <section aria-labelledby="welcome-heading" className="rounded-xl bg-ink p-6 text-inverse sm:p-10">
      <h2 id="welcome-heading" className="text-2xl font-semibold sm:text-3xl" style={FONT_DISPLAY}>
        Welcome to {APP_NAME}
      </h2>
      <p className="mt-3 max-w-prose text-inverse/80">
        Four steps to a support bot on your site. Your activity shows here once chats come in.
      </p>
      <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, index) => (
          <li key={step.title} className="border-t border-inverse/15 pt-4">
            <span className="text-2xl font-semibold text-inverse" style={FONT_DISPLAY}>
              {index + 1}
            </span>
            <p className="mt-2 font-medium">{step.title}</p>
            <p className="mt-1 text-sm text-inverse/70">{step.body}</p>
          </li>
        ))}
      </ol>
      <Link
        href={PROJECTS_PATH}
        className={`mt-8 inline-block rounded-md bg-inverse px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-inverse/90 ${FOCUS_ON_INK}`}
      >
        Create project
      </Link>
    </section>
  );
}

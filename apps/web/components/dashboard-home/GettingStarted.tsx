import Link from "next/link";
import { APP_NAME } from "@askwell/shared";
import { PROJECTS_PATH } from "../dashboard-nav/routes";
import { FONT_DISPLAY } from "../landing/fonts";

const STEPS = [
  { title: "Create a project", body: "One project per site or help center." },
  { title: "Add knowledge", body: "Upload your docs or paste an FAQ. The bot answers only from these." },
  { title: "Install the widget", body: "Paste one script tag into your site." },
  { title: "Get your first chat", body: "Visitors ask, the bot answers, and the chats show up here." },
];

/** The home for an account with no projects yet. */
export function GettingStarted() {
  return (
    <section aria-labelledby="welcome-heading" className="rounded-xl bg-[#10131D] p-6 text-white sm:p-10">
      <h2 id="welcome-heading" className="text-2xl font-semibold sm:text-3xl" style={FONT_DISPLAY}>
        Welcome to {APP_NAME}
      </h2>
      <p className="mt-3 max-w-prose text-[#C3C9D6]">
        Four steps to a support bot on your site. Your activity shows here once chats come in.
      </p>
      <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, index) => (
          <li key={step.title} className="border-t border-white/15 pt-4">
            <span className="text-2xl font-semibold text-[#F2A33C]" style={FONT_DISPLAY}>
              {index + 1}
            </span>
            <p className="mt-2 font-medium">{step.title}</p>
            <p className="mt-1 text-sm text-[#AEB5C4]">{step.body}</p>
          </li>
        ))}
      </ol>
      <Link
        href={PROJECTS_PATH}
        className="mt-8 inline-block rounded-md bg-[#F2A33C] px-4 py-2.5 text-sm font-medium text-[#10131D] hover:bg-[#F5B35C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        Create project
      </Link>
    </section>
  );
}

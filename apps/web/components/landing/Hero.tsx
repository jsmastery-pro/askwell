import Link from "next/link";
import { APP_NAME } from "@askwell/shared";
import { Container } from "../Container";

export function Hero() {
  return (
    <section className="py-24 text-center">
      <Container>
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          Turn your docs into a support bot with {APP_NAME}
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-slate-400">
          Paste your product info or upload a PDF, copy one script tag, and give every visitor a
          chat bot that answers from your own content.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/sign-up"
            className="rounded-full bg-slate-50 px-6 py-3 font-semibold text-slate-950 transition hover:bg-slate-200"
          >
            Start free
          </Link>
          <a
            href="#how-it-works"
            className="rounded-full border border-slate-700 px-6 py-3 font-semibold text-slate-50 transition hover:border-slate-500"
          >
            See how it works
          </a>
        </div>
      </Container>
    </section>
  );
}

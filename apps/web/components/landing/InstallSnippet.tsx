import { Container } from "../Container";

export function InstallSnippet() {
  return (
    <section className="border-t border-slate-800 py-24">
      <Container>
        <h2 className="text-center text-3xl font-bold">Install in one line</h2>
        <p className="mx-auto mt-4 max-w-xl text-center text-slate-400">
          After you sign up, copy your project&apos;s snippet and paste it before the closing{" "}
          <code>&lt;/body&gt;</code> tag.
        </p>
        <pre className="mx-auto mt-8 max-w-xl overflow-x-auto rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300">
          <code>{'<script src="https://askwell.app/widget.js" data-key="pk_..."></script>'}</code>
        </pre>
      </Container>
    </section>
  );
}

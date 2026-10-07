import { APP_NAME } from "@askwell/shared";
import { Container } from "../Container";

export function LiveDemoPlaceholder() {
  return (
    <section className="border-t border-slate-800 py-24">
      <Container>
        <h2 className="text-center text-3xl font-bold">See it in action</h2>
        <p className="mx-auto mt-4 max-w-xl text-center text-slate-400">
          The live {APP_NAME} widget runs right here on launch. For now, here&apos;s a preview.
        </p>
        <div className="mx-auto mt-12 max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <span className="text-sm font-semibold">{APP_NAME} assistant</span>
            <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
          </div>
          <div className="mt-3 space-y-2">
            <div className="max-w-[80%] rounded-xl rounded-tl-none bg-slate-800 px-3 py-2 text-sm text-slate-300">
              Hi! Ask me anything about this product.
            </div>
            <div className="ml-auto max-w-[80%] rounded-xl rounded-tr-none bg-slate-50 px-3 py-2 text-sm text-slate-950">
              What does the Pro plan include?
            </div>
            <div className="max-w-[80%] rounded-xl rounded-tl-none bg-slate-800 px-3 py-2 text-sm text-slate-300">
              5 projects, 2,000 messages a month, and full widget customization.
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

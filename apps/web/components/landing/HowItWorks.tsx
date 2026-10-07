import { Container } from "../Container";

const STEPS = [
  {
    title: "Add your knowledge",
    description: "Paste text or upload a PDF with your product info.",
  },
  {
    title: "Copy one script tag",
    description: "Paste it into your site. No code required.",
  },
  {
    title: "Visitors get real answers",
    description: "The bot answers from your docs, any time of day.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-slate-800 py-24">
      <Container>
        <h2 className="text-center text-3xl font-bold">How it works</h2>
        <ol className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 font-semibold">
                {index + 1}
              </div>
              <h3 className="mt-4 font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-slate-400">{step.description}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

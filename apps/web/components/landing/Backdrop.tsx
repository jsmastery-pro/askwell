/**
 * The page's light: soft glows on the canvas, so the glass has something to blur. The layers
 * move with transforms only, and nothing here is blurred itself.
 */
export function Backdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[1400px] overflow-hidden">
      <div className="ambient-drift absolute top-[-280px] left-1/2 h-[900px] w-[1300px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--color-glow),var(--color-glow-soft)_55%,transparent)]" />
      <div className="absolute top-[520px] right-[-260px] h-[620px] w-[620px] rounded-full bg-[radial-gradient(closest-side,var(--color-glow-soft),transparent)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_70%,var(--color-canvas))]" />
    </div>
  );
}

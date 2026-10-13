import type { ReactNode } from "react";
import { FONT_DISPLAY } from "../landing/fonts";

/** A top-level dashboard page's title (h1), e.g. Projects or Billing. */
export function PageHeader({ title, description }: { title: ReactNode; description?: ReactNode }) {
  return (
    <header className="mb-8">
      <h1 className="text-3xl font-semibold break-words text-[#161A24]" style={FONT_DISPLAY}>
        {title}
      </h1>
      {description && <p className="mt-3 max-w-prose text-[#70788D]">{description}</p>}
    </header>
  );
}

/** A section heading (h2), e.g. at the top of a project tab, with an optional badge and actions. */
export function SectionHeader({
  title,
  description,
  badge,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold text-[#161A24]" style={FONT_DISPLAY}>
            {title}
          </h2>
          {badge}
        </div>
        {description && <p className="mt-2 max-w-xl text-sm text-[#70788D]">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

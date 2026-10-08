import { APP_NAME } from "@askwell/shared";
import { FONT_DISPLAY } from "../../components/landing/fonts";

export default function DashboardPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-semibold text-[#161A24]" style={FONT_DISPLAY}>
        Welcome to {APP_NAME}
      </h1>
      <p className="mt-4 leading-relaxed text-[#70788D]">
        This is where your projects will live. Each project gets its own knowledge, chat widget
        and conversations.
      </p>
      <div className="mt-10 rounded-xl border border-dashed border-[#CBD2DE] bg-white px-6 py-12 text-center">
        <p className="font-medium text-[#161A24]">No projects yet</p>
        <p className="mt-1 text-sm text-[#70788D]">
          Creating a project is coming in the next update.
        </p>
      </div>
    </div>
  );
}

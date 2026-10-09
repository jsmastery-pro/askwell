import { mountWidget } from "./loader";

const script = document.currentScript;
if (script instanceof HTMLScriptElement) void mountWidget(script);

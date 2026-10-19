"use client";

import { Unavailable } from "../../components/widget-panel/Unavailable";

// Inside a customer's site, a failed panel says the chat is unavailable, never shows an app error page.
export default function EmbedError() {
  return <Unavailable />;
}

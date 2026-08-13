"use node";

// Renders the branded React Email components (src/emails/templates/) to the html+text pair
// EmailMessage expects. One helper so every send action renders the same way — no action
// hand-rolls its own render() call with slightly different options.

import { render } from "@react-email/render";
import type { ReactElement } from "react";

export async function renderEmail(component: ReactElement): Promise<{ html: string; text: string }> {
  const [html, text] = await Promise.all([
    render(component),
    render(component, { plainText: true }),
  ]);
  return { html, text };
}

import type { RouteRenderContext, VNode } from "@rezi-ui/core";
import { ui } from "@rezi-ui/core";
import type { ScreenRouteDeps, TuiState } from "../types.js";
import { renderShell } from "./shell.js";

function buildUsageBody(): VNode {
  return ui.column({ gap: 1 }, [
    ui.badge("Usage shell ready", { variant: "info" }),
    ui.text("Usage inherits the shared shell header, keyline, and footer hint bar."),
    ui.callout("Request totals, token metrics, and cache columns land in 5C and 5E.", { variant: "info" }),
  ]);
}

export function renderUsageScreen(context: RouteRenderContext<TuiState>, deps: ScreenRouteDeps): VNode {
  return renderShell({
    context,
    title: "Usage",
    body: buildUsageBody(),
    onNavigate: deps.onNavigate,
    onToggleSidebar: deps.onToggleSidebar,
  });
}

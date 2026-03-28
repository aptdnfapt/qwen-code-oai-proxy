import type { RouteRenderContext, VNode } from "@rezi-ui/core";
import { ui } from "@rezi-ui/core";
import type { ScreenRouteDeps, TuiState } from "../types.js";
import { renderShell } from "./shell.js";

function buildHelpBody(): VNode {
  return ui.column({ gap: 1 }, [
    ui.badge("Help shell ready", { variant: "info" }),
    ui.text("Help already has a dedicated route inside the shell.", { variant: "caption" }),
    ui.callout("Shortcut docs, auth guidance, and paths land in 5C.", { variant: "info" }),
  ]);
}

export function renderHelpScreen(context: RouteRenderContext<TuiState>, deps: ScreenRouteDeps): VNode {
  return renderShell({
    context,
    title: "Help",
    body: buildHelpBody(),
    onNavigate: deps.onNavigate,
    onToggleSidebar: deps.onToggleSidebar,
  });
}

import type { RouteRenderContext, VNode } from "@rezi-ui/core";
import { ui } from "@rezi-ui/core";
import type { ScreenRouteDeps, TuiState } from "../types.js";
import { renderShell } from "./shell.js";

function buildLiveBody(): VNode {
  return ui.column({ gap: 1 }, [
    ui.badge("Phase 5A shell scaffold", { variant: "info" }),
    ui.text("Live is the default workspace. Shell layout, header, footer, and sidebar are active now."),
    ui.callout("Live log streaming, server controls, and log-level actions land in 5C.", { variant: "info" }),
  ]);
}

export function renderLiveScreen(context: RouteRenderContext<TuiState>, deps: ScreenRouteDeps): VNode {
  return renderShell({
    context,
    title: "Live",
    body: buildLiveBody(),
    onNavigate: deps.onNavigate,
    onToggleSidebar: deps.onToggleSidebar,
  });
}

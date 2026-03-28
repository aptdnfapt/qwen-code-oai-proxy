import type { RouteRenderContext, VNode } from "@rezi-ui/core";
import { ui } from "@rezi-ui/core";
import type { ScreenRouteDeps, TuiState } from "../types.js";
import { renderShell } from "./shell.js";

function buildArtifactsBody(): VNode {
  return ui.column({ gap: 1 }, [
    ui.badge("Artifacts shell ready", { variant: "info" }),
    ui.text("Artifacts already owns workspace width inside the shell."),
    ui.callout("File tree explorer and preview panes land in 5C.", { variant: "info" }),
  ]);
}

export function renderArtifactsScreen(context: RouteRenderContext<TuiState>, deps: ScreenRouteDeps): VNode {
  return renderShell({
    context,
    title: "Artifacts",
    body: buildArtifactsBody(),
    onNavigate: deps.onNavigate,
    onToggleSidebar: deps.onToggleSidebar,
  });
}

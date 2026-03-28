import type { RouteRenderContext, VNode } from "@rezi-ui/core";
import { ui } from "@rezi-ui/core";
import type { ScreenRouteDeps, TuiState } from "../types.js";
import { renderShell } from "./shell.js";

function buildSettingsBody(): VNode {
  return ui.column({ gap: 1 }, [
    ui.badge("Settings shell ready", { variant: "info" }),
    ui.text("Settings can already live in the shared shell without collapsing the workspace."),
    ui.callout("Theme, icon mode, sidebar mode, and runtime defaults land in 5C and 5F.", { variant: "info" }),
  ]);
}

export function renderSettingsScreen(context: RouteRenderContext<TuiState>, deps: ScreenRouteDeps): VNode {
  return renderShell({
    context,
    title: "Settings",
    body: buildSettingsBody(),
    onNavigate: deps.onNavigate,
    onToggleSidebar: deps.onToggleSidebar,
  });
}

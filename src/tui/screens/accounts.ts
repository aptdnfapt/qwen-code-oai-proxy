import type { RouteRenderContext, VNode } from "@rezi-ui/core";
import { ui } from "@rezi-ui/core";
import type { ScreenRouteDeps, TuiState } from "../types.js";
import { renderShell } from "./shell.js";

function buildAccountsBody(): VNode {
  return ui.column({ gap: 1 }, [
    ui.badge("Accounts shell ready", { variant: "info" }),
    ui.text("Accounts already has the full workspace frame and truthful runtime header above it."),
    ui.callout("Tables, detail panels, and add-account UX land in 5C and 5D.", { variant: "info" }),
  ]);
}

export function renderAccountsScreen(context: RouteRenderContext<TuiState>, deps: ScreenRouteDeps): VNode {
  return renderShell({
    context,
    title: "Accounts",
    body: buildAccountsBody(),
    onNavigate: deps.onNavigate,
    onToggleSidebar: deps.onToggleSidebar,
  });
}

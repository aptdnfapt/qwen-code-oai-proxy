import type { RouteRenderContext, VNode } from "@rezi-ui/core";
import { ui } from "@rezi-ui/core";
import type { ScreenRouteDeps, TuiState } from "../types.js";
import { renderShell } from "./shell.js";

type KeyBinding = Readonly<{
  keys: string;
  description: string;
}>;

const GLOBAL_BINDINGS: readonly KeyBinding[] = [
  { keys: "q", description: "Quit the application" },
  { keys: "Tab", description: "Switch focus region (sidebar ↔ main)" },
  { keys: "Shift+Tab", description: "Switch focus region (reverse)" },
  { keys: "[", description: "Toggle sidebar collapse/expand" },
  { keys: "t", description: "Toggle theme (dark ↔ light)" },
  { keys: "i", description: "Toggle icon mode (nerd ↔ fallback)" },
  { keys: "? / h", description: "Open help screen" },
];

const SIDEBAR_BINDINGS: readonly KeyBinding[] = [
  { keys: "↑ / ↓", description: "Navigate sidebar items" },
  { keys: "Enter", description: "Activate selected screen" },
];

const SCREEN_BINDINGS: readonly KeyBinding[] = [
  { keys: "↑ / ↓", description: "Navigate lists and tables" },
  { keys: "Enter", description: "Activate or inspect selected item" },
  { keys: "Scroll", description: "Mouse wheel scrolls content" },
];

function buildBindingsSection(title: string, bindings: readonly KeyBinding[]): VNode {
  return ui.column({ gap: 0 }, [
    ui.text(title, { variant: "heading" }),
    ui.divider({ color: "muted" }),
    ...bindings.map((binding) =>
      ui.row({ gap: 2, items: "center" }, [
        ui.box({ width: 14 }, [ui.text(binding.keys, { variant: "code" })]),
        ui.text(binding.description, { variant: "caption" }),
      ]),
    ),
  ]);
}

function buildAuthGuidance(): VNode {
  return ui.column({ gap: 1 }, [
    ui.text("Authentication", { variant: "heading" }),
    ui.divider({ color: "muted" }),
    ui.text("To add a new account:", { variant: "caption" }),
    ui.column({ gap: 0 }, [
      ui.text("1. Go to Accounts screen", { variant: "caption" }),
      ui.text("2. Click '+ Add account' or press A", { variant: "caption" }),
      ui.text("3. Scan the QR code or visit the auth URL", { variant: "caption" }),
      ui.text("4. Enter the device code shown", { variant: "caption" }),
      ui.text("5. Complete login in browser", { variant: "caption" }),
    ]),
    ui.spacer({ size: 1 }),
    ui.text("CLI alternative:", { variant: "caption" }),
    ui.text("node authenticate.js --add <account-id>", { variant: "code" }),
  ]);
}

function buildPathsReference(): VNode {
  return ui.column({ gap: 1 }, [
    ui.text("Important paths", { variant: "heading" }),
    ui.divider({ color: "muted" }),
    ui.row({ gap: 1 }, [
      ui.text("Config:", { variant: "caption" }),
      ui.text("~/.config/qwen-proxy/config.json", { variant: "code" }),
    ]),
    ui.row({ gap: 1 }, [
      ui.text("Logs:", { variant: "caption" }),
      ui.text("~/.local/share/qwen-proxy/logs/", { variant: "code" }),
    ]),
    ui.row({ gap: 1 }, [
      ui.text("Accounts:", { variant: "caption" }),
      ui.text("~/.local/share/qwen-proxy/accounts/", { variant: "code" }),
    ]),
    ui.row({ gap: 1 }, [
      ui.text("Artifacts:", { variant: "caption" }),
      ui.text("./debug/ (working directory)", { variant: "code" }),
    ]),
  ]);
}

function buildTroubleshooting(): VNode {
  return ui.column({ gap: 1 }, [
    ui.text("Troubleshooting", { variant: "heading" }),
    ui.divider({ color: "muted" }),
    ui.text("Auth expired? Refresh the account or re-authenticate.", { variant: "caption" }),
    ui.text("No logs? Check DEBUG_LOG=true in your environment.", { variant: "caption" }),
    ui.text("Port conflict? Set PORT=<number> in environment.", { variant: "caption" }),
  ]);
}

function buildHelpBody(): VNode {
  return ui.row({ gap: 2, flex: 1 }, [
    ui.column({ gap: 2, flex: 1 }, [
      buildBindingsSection("Global shortcuts", GLOBAL_BINDINGS),
      buildBindingsSection("Sidebar navigation", SIDEBAR_BINDINGS),
      buildBindingsSection("Screen navigation", SCREEN_BINDINGS),
    ]),
    ui.column({ gap: 2, flex: 1 }, [
      buildAuthGuidance(),
      buildPathsReference(),
      buildTroubleshooting(),
    ]),
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

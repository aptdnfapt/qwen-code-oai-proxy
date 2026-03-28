import type { RouteRenderContext, VNode } from "@rezi-ui/core";
import { ui } from "@rezi-ui/core";
import { PRODUCT_NAME, PRODUCT_TAGLINE, themeSpec } from "../theme.js";
import { NAV_ITEMS, type NavItem, type ScreenId, type TuiState } from "../types.js";

type ShellOptions = Readonly<{
  context: RouteRenderContext<TuiState>;
  title: string;
  body: VNode;
  onNavigate: (screen: ScreenId) => void;
  onToggleSidebar: () => void;
}>;

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function statusVariant(status: TuiState["runtime"]["status"]): "success" | "warning" {
  return status === "ready" ? "success" : "warning";
}

function statusLabel(status: TuiState["runtime"]["status"]): string {
  return status === "ready" ? "READY" : "NO AUTH";
}

function formatStreamCount(streamCount: TuiState["runtime"]["streamCount"]): string {
  return String(streamCount);
}

function navIcon(item: NavItem, useFallback: boolean): string {
  return useFallback ? item.fallbackIcon : item.nerdIcon;
}

function renderSidebar(options: ShellOptions): VNode {
  const state = options.context.state;
  const collapsed = state.sidebarMode === "collapsed" || state.viewportCols <= 100;
  const useFallback = state.iconMode === "fallback";

  const buttons = NAV_ITEMS.map((item) => {
    const icon = navIcon(item, useFallback);
    const label = collapsed ? icon : `${icon} ${item.title}`;
    return ui.button({
      id: `sidebar-${item.id}`,
      label,
      intent: state.activeScreen === item.id ? "primary" : "secondary",
      onPress: () => options.onNavigate(item.id),
    });
  });

  return ui.box(
    {
      border: "none",
      p: 1,
      width: collapsed ? 8 : 22,
      height: "full",
    },
    [
      ui.column({ gap: 1 }, [
        ui.text(collapsed ? "QP" : PRODUCT_NAME, { variant: "heading" }),
        collapsed ? null : ui.text(PRODUCT_TAGLINE, { variant: "caption" }),
        ui.column({ gap: 0 }, buttons),
        ui.spacer({ flex: 1 }),
        ui.button({
          id: "sidebar-toggle",
          label: collapsed ? "[>]" : "[<] collapse",
          intent: "link",
          onPress: options.onToggleSidebar,
        }),
      ]),
    ],
  );
}

function renderHeader(state: TuiState): VNode {
  const runtime = state.runtime;
  const compact = state.viewportCols <= 100;

  const primary = ui.row({ gap: 1, items: "center", wrap: true }, [
    ui.badge(statusLabel(runtime.status), { variant: statusVariant(runtime.status) }),
    ui.text(`up ${formatDuration(runtime.uptimeMs)}`, { variant: "caption" }),
    ui.text(`host ${runtime.host}:${String(runtime.port)}`, { variant: "code" }),
    ui.badge(runtime.rotationMode, { variant: "info" }),
    compact ? null : ui.spacer({ flex: 1 }),
    compact ? null : ui.text(`theme ${themeSpec(state.themeName).label}`, { variant: "caption" }),
  ]);

  const secondary = ui.row({ gap: 1, items: "center", wrap: true }, [
    ui.text(`loaded ${String(runtime.accountCount)} acc`, { variant: "caption" }),
    ui.text(`stored req ${String(runtime.requestCount)}`, { variant: "caption" }),
    ui.text(`streams ${formatStreamCount(runtime.streamCount)}`, { variant: "caption" }),
    ui.spacer({ flex: 1 }),
    compact ? ui.text(`theme ${themeSpec(state.themeName).label}`, { variant: "caption" }) : null,
  ]);

  return ui.box(
    {
      border: "none",
      px: 1,
      py: 0,
    },
    [
      ui.column({ gap: compact ? 0 : 1 }, [primary, secondary]),
    ],
  );
}

function renderFooter(state: TuiState): VNode {
  const compact = state.viewportCols <= 100;

  return ui.statusBar({
    left: [
      compact
        ? ui.row({ gap: 1, items: "center" }, [
            ui.text("[ toggle", { variant: "caption" }),
            ui.text("Q quit", { variant: "caption" }),
          ])
        : ui.row({ gap: 1, items: "center" }, [
            ui.text("[ sidebar", { variant: "caption" }),
            ui.text(state.iconMode === "fallback" ? "I fallback icons" : "I nerd icons", { variant: "caption" }),
            ui.text("T theme", { variant: "caption" }),
            ui.text("Q quit", { variant: "caption" }),
            ui.text("click sidebar to navigate", { variant: "caption" }),
          ]),
    ],
    right: [
      ui.text(
        state.sidebarMode === "collapsed" || compact ? "icons" : "icons + labels",
        { variant: "caption" },
      ),
    ],
  });
}

export function renderShell(options: ShellOptions): VNode {
  const state = options.context.state;
  const wide = state.viewportCols >= 140;

  const workspace = wide
    ? ui.row({ gap: 2, items: "start" }, [
        ui.box({ border: "none", flex: 3 }, [options.body]),
        ui.box({ border: "none", width: 34 }, [
          ui.column({ gap: 1 }, [
            ui.text("Shell snapshot", { variant: "heading" }),
            ui.text(`status ${statusLabel(state.runtime.status)}`, { variant: "caption" }),
            ui.text(`rotation ${state.runtime.rotationMode}`, { variant: "caption" }),
            ui.text(`accounts ${String(state.runtime.accountCount)}`, { variant: "caption" }),
            ui.text(`requests ${String(state.runtime.requestCount)}`, { variant: "caption" }),
            ui.text(`streams ${formatStreamCount(state.runtime.streamCount)}`, { variant: "caption" }),
            ui.divider({ color: "muted" }),
            ui.text("Layout snapshot", { variant: "heading" }),
            ui.text(`viewport ${String(state.viewportCols)}x${String(state.viewportRows)}`, { variant: "caption" }),
            ui.text(`icons ${state.iconMode}`, { variant: "caption" }),
            ui.text(`theme ${themeSpec(state.themeName).label}`, { variant: "caption" }),
            ui.text(`sidebar ${state.sidebarMode}`, { variant: "caption" }),
          ]),
        ]),
      ])
    : options.body;

  return ui.page({
    p: 1,
    gap: 0,
    header: renderHeader(state),
    body: ui.row({ gap: 0, items: "stretch" }, [
      renderSidebar(options),
      ui.box({ border: "none", width: 1, py: 0 }, [ui.divider({ direction: "vertical", color: "muted" })]),
      ui.box({ border: "none", flex: 1, p: 1 }, [
        ui.column({ gap: 1 }, [
          ui.row({ gap: 1, items: "center", wrap: true }, [
            ui.text(options.title, { variant: "heading" }),
            ui.badge("5A", { variant: "info" }),
          ]),
          workspace,
        ]),
      ]),
    ]),
    footer: renderFooter(state),
  });
}

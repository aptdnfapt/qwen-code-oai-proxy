import type { RouteRenderContext, VNode } from "@rezi-ui/core";
import { ui } from "@rezi-ui/core";
import type { LogLevel, ScreenRouteDeps, TuiState } from "../types.js";
import { renderShell } from "./shell.js";

const LOG_LEVELS: readonly LogLevel[] = ["off", "error", "error-debug", "debug"];

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

function levelVariant(level: string): "info" | "warn" | "error" | "debug" {
  if (level === "error") return "error";
  if (level === "warn") return "warn";
  if (level === "debug") return "debug";
  return "info";
}

type LiveBodyDeps = Readonly<{
  state: TuiState;
  onLogLevelChange: (level: LogLevel) => void;
  onLogsScroll: (scrollTop: number) => void;
}>;

function buildServerControlsRow(): VNode {
  return ui.row({ gap: 1, items: "center" }, [
    ui.text("Server:", { variant: "caption" }),
    ui.button({ id: "live-start", label: "Start", intent: "success" }),
    ui.button({ id: "live-stop", label: "Stop", intent: "danger" }),
    ui.button({ id: "live-restart", label: "Restart", intent: "warning" }),
  ]);
}

function buildLogLevelRow(currentLevel: LogLevel, onLogLevelChange: (level: LogLevel) => void): VNode {
  const buttons = LOG_LEVELS.map((level) =>
    ui.button({
      id: `log-level-${level}`,
      label: level,
      intent: currentLevel === level ? "primary" : "secondary",
      onPress: () => onLogLevelChange(level),
    }),
  );

  return ui.row({ gap: 1, items: "center" }, [
    ui.text("Log level:", { variant: "caption" }),
    ...buttons,
  ]);
}

function buildLogsConsole(deps: LiveBodyDeps): VNode {
  const { state, onLogsScroll } = deps;
  const logs = state.live.logs;

  if (logs.length === 0) {
    return ui.box({ border: "single", p: 1, flex: 1 }, [
      ui.column({ gap: 1 }, [
        ui.text("No logs yet", { variant: "caption" }),
        ui.text("Logs will appear here when the server processes requests.", { variant: "caption" }),
      ]),
    ]);
  }

  const entries = logs.map((log) => ({
    id: log.id,
    timestamp: log.timestamp,
    level: levelVariant(log.level),
    message: log.message,
    source: log.source ?? "server",
  }));

  return ui.logsConsole({
    id: "live-logs",
    entries,
    autoScroll: true,
    scrollTop: state.live.logsScrollTop,
    showTimestamps: true,
    onScroll: onLogsScroll,
  });
}

function buildLiveBody(deps: LiveBodyDeps): VNode {
  const { state, onLogLevelChange } = deps;
  const runtime = state.runtime;

  return ui.column({ gap: 1, flex: 1 }, [
    ui.row({ gap: 2, items: "center", wrap: true }, [
      ui.text(`host ${runtime.host}:${String(runtime.port)}`, { variant: "code" }),
      ui.text(`accounts ${String(runtime.accountCount)}`, { variant: "caption" }),
      ui.text(`requests ${String(runtime.requestCount)}`, { variant: "caption" }),
      ui.text(`streams ${String(runtime.streamCount)}`, { variant: "caption" }),
    ]),
    ui.divider({ color: "muted" }),
    buildServerControlsRow(),
    buildLogLevelRow(state.live.logLevel, onLogLevelChange),
    ui.divider({ color: "muted" }),
    ui.text("Live stream", { variant: "heading" }),
    buildLogsConsole(deps),
  ]);
}

export function renderLiveScreen(
  context: RouteRenderContext<TuiState>,
  deps: ScreenRouteDeps & {
    onLogLevelChange: (level: LogLevel) => void;
    onLogsScroll: (scrollTop: number) => void;
  },
): VNode {
  return renderShell({
    context,
    title: "Live",
    body: buildLiveBody({
      state: context.state,
      onLogLevelChange: deps.onLogLevelChange,
      onLogsScroll: deps.onLogsScroll,
    }),
    onNavigate: deps.onNavigate,
    onToggleSidebar: deps.onToggleSidebar,
  });
}

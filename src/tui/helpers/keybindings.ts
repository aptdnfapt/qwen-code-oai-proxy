import type { FocusRegion, ScreenId, TuiAction } from "../types.js";

export type GlobalKeyResult = Readonly<
  | { kind: "action"; action: TuiAction }
  | { kind: "quit" }
  | { kind: "navigate"; screen: ScreenId }
>;

export type KeybindingDeps = Readonly<{
  dispatch: (action: TuiAction) => void;
  onQuit: () => void;
  onNavigate: (screen: ScreenId) => void;
  getFocusRegion: () => FocusRegion;
}>;

export function resolveGlobalKey(key: string, focusRegion: FocusRegion): GlobalKeyResult | null {
  switch (key) {
    case "q":
    case "ctrl+c":
      return Object.freeze({ kind: "quit" });
    case "[":
      return Object.freeze({ kind: "action", action: Object.freeze({ type: "toggle-sidebar" }) });
    case "i":
      return Object.freeze({ kind: "action", action: Object.freeze({ type: "toggle-icon-mode" }) });
    case "t":
      return Object.freeze({ kind: "action", action: Object.freeze({ type: "cycle-theme" }) });
    case "tab":
      return Object.freeze({ kind: "action", action: Object.freeze({ type: "focus-next-region" }) });
    case "shift+tab":
      return Object.freeze({ kind: "action", action: Object.freeze({ type: "focus-prev-region" }) });
    case "?":
    case "h":
      return Object.freeze({ kind: "navigate", screen: "help" });
    default:
      break;
  }

  // Arrow keys only apply when sidebar is focused
  if (focusRegion === "sidebar") {
    switch (key) {
      case "up":
        return Object.freeze({ kind: "action", action: Object.freeze({ type: "sidebar-move", direction: "up" }) });
      case "down":
        return Object.freeze({ kind: "action", action: Object.freeze({ type: "sidebar-move", direction: "down" }) });
      case "enter":
        return Object.freeze({ kind: "action", action: Object.freeze({ type: "sidebar-activate" }) });
      default:
        break;
    }
  }

  return null;
}

export function createKeybindingMap(deps: KeybindingDeps): Record<string, () => void> {
  const bind = (key: string): (() => void) => {
    return () => {
      const focusRegion = deps.getFocusRegion();
      const result = resolveGlobalKey(key, focusRegion);
      if (!result) {
        return;
      }

      if (result.kind === "quit") {
        deps.onQuit();
        return;
      }

      if (result.kind === "navigate") {
        deps.onNavigate(result.screen);
        return;
      }

      deps.dispatch(result.action);
    };
  };

  return {
    q: bind("q"),
    "ctrl+c": bind("ctrl+c"),
    "[": bind("["),
    i: bind("i"),
    t: bind("t"),
    tab: bind("tab"),
    "shift+tab": bind("shift+tab"),
    up: bind("up"),
    down: bind("down"),
    enter: bind("enter"),
    "?": bind("?"),
    h: bind("h"),
  };
}

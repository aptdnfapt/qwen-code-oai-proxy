import type { TuiAction } from "../types.js";

export type GlobalKeyResult = Readonly<
  | { kind: "action"; action: TuiAction }
  | { kind: "quit" }
>;

export type KeybindingDeps = Readonly<{
  dispatch: (action: TuiAction) => void;
  onQuit: () => void;
}>;

export function resolveGlobalKey(key: string): GlobalKeyResult | null {
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
    default:
      return null;
  }
}

export function createKeybindingMap(deps: KeybindingDeps): Record<string, () => void> {
  const bind = (key: string): (() => void) => {
    return () => {
      const result = resolveGlobalKey(key);
      if (!result) {
        return;
      }

      if (result.kind === "quit") {
        deps.onQuit();
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
  };
}

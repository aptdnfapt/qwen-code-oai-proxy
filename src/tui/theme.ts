import { lightTheme, nordTheme, type ThemeDefinition } from "@rezi-ui/core";
import type { ThemeName } from "./types.js";

type ThemeSpec = Readonly<{
  label: string;
  theme: ThemeDefinition;
}>;

export const PRODUCT_NAME = "qwen-proxy";
export const PRODUCT_TAGLINE = "Operator shell";

const THEME_SPECS: Readonly<Record<ThemeName, ThemeSpec>> = Object.freeze({
  dark: Object.freeze({ label: "Dark", theme: nordTheme }),
  light: Object.freeze({ label: "Light", theme: lightTheme }),
});

export function themeSpec(themeName: ThemeName): ThemeSpec {
  return THEME_SPECS[themeName];
}

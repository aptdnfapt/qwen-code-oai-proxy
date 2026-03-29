import { color, createThemeDefinition, type ThemeDefinition } from "@rezi-ui/core";
import type { ThemeName } from "./types.js";

// Catppuccin Mocha (dark theme)
const catppuccinMocha: ThemeDefinition = createThemeDefinition("catppuccin-mocha", {
  bg: {
    base: color(30, 30, 46),      // #1e1e2e Base
    elevated: color(24, 24, 37),  // #181825 Mantle
    overlay: color(49, 50, 68),   // #313244 Surface0
    subtle: color(17, 17, 27),    // #11111b Crust
  },
  fg: {
    primary: color(205, 214, 244),   // #cdd6f4 Text
    secondary: color(186, 194, 222), // #bac2de Subtext1
    muted: color(166, 173, 200),     // #a6adc8 Subtext0
    inverse: color(30, 30, 46),      // #1e1e2e Base
  },
  accent: {
    primary: color(137, 180, 250),   // #89b4fa Blue
    secondary: color(203, 166, 247), // #cba6f7 Mauve
    tertiary: color(148, 226, 213),  // #94e2d5 Teal
  },
  success: color(166, 227, 161),  // #a6e3a1 Green
  warning: color(249, 226, 175),  // #f9e2af Yellow
  error: color(243, 139, 168),    // #f38ba8 Red
  info: color(137, 180, 250),     // #89b4fa Blue
  focus: {
    ring: color(180, 190, 254),   // #b4befe Lavender
    bg: color(49, 50, 68),        // #313244 Surface0
  },
  selected: {
    bg: color(69, 71, 90),        // #45475a Surface1
    fg: color(205, 214, 244),     // #cdd6f4 Text
  },
  disabled: {
    fg: color(108, 112, 134),     // #6c7086 Overlay0
    bg: color(24, 24, 37),        // #181825 Mantle
  },
  diagnostic: {
    error: color(243, 139, 168),  // #f38ba8 Red
    warning: color(250, 179, 135),// #fab387 Peach
    info: color(137, 180, 250),   // #89b4fa Blue
    hint: color(148, 226, 213),   // #94e2d5 Teal
  },
  border: {
    subtle: color(49, 50, 68),    // #313244 Surface0
    default: color(69, 71, 90),   // #45475a Surface1
    strong: color(88, 91, 112),   // #585b70 Surface2
  },
});

// Catppuccin Latte (light theme)
const catppuccinLatte: ThemeDefinition = createThemeDefinition("catppuccin-latte", {
  bg: {
    base: color(239, 241, 245),   // #eff1f5 Base
    elevated: color(230, 233, 239), // #e6e9ef Mantle
    overlay: color(204, 208, 218), // #ccd0da Surface0
    subtle: color(220, 224, 232),  // #dce0e8 Crust
  },
  fg: {
    primary: color(76, 79, 105),   // #4c4f69 Text
    secondary: color(92, 95, 119), // #5c5f77 Subtext1
    muted: color(108, 111, 133),   // #6c6f85 Subtext0
    inverse: color(239, 241, 245), // #eff1f5 Base
  },
  accent: {
    primary: color(30, 102, 245),  // #1e66f5 Blue
    secondary: color(136, 57, 239), // #8839ef Mauve
    tertiary: color(23, 146, 153), // #179299 Teal
  },
  success: color(64, 160, 43),    // #40a02b Green
  warning: color(223, 142, 29),   // #df8e1d Yellow
  error: color(210, 15, 57),      // #d20f39 Red
  info: color(30, 102, 245),      // #1e66f5 Blue
  focus: {
    ring: color(114, 135, 253),   // #7287fd Lavender
    bg: color(204, 208, 218),     // #ccd0da Surface0
  },
  selected: {
    bg: color(188, 192, 204),     // #bcc0cc Surface1
    fg: color(76, 79, 105),       // #4c4f69 Text
  },
  disabled: {
    fg: color(156, 160, 176),     // #9ca0b0 Overlay0
    bg: color(230, 233, 239),     // #e6e9ef Mantle
  },
  diagnostic: {
    error: color(210, 15, 57),    // #d20f39 Red
    warning: color(254, 100, 11), // #fe640b Peach
    info: color(30, 102, 245),    // #1e66f5 Blue
    hint: color(23, 146, 153),    // #179299 Teal
  },
  border: {
    subtle: color(204, 208, 218), // #ccd0da Surface0
    default: color(188, 192, 204), // #bcc0cc Surface1
    strong: color(172, 176, 190), // #acb0be Surface2
  },
});

type ThemeSpec = Readonly<{
  label: string;
  theme: ThemeDefinition;
}>;

export const PRODUCT_NAME = "qwen-proxy";
export const PRODUCT_TAGLINE = "Operator shell";

const THEME_SPECS: Readonly<Record<ThemeName, ThemeSpec>> = Object.freeze({
  dark: Object.freeze({ label: "Dark", theme: catppuccinMocha }),
  light: Object.freeze({ label: "Light", theme: catppuccinLatte }),
});

export function themeSpec(themeName: ThemeName): ThemeSpec {
  return THEME_SPECS[themeName];
}

/** Get the background base color for the current theme */
export function themeBgBase(themeName: ThemeName): number {
  return THEME_SPECS[themeName].theme.colors.bg.base;
}

/** Get the foreground primary color for the current theme */
export function themeFgPrimary(themeName: ThemeName): number {
  return THEME_SPECS[themeName].theme.colors.fg.primary;
}

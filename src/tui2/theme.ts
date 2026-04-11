import chalk from "chalk";
import type { ThemeName } from "./types.js";

type Paint = (text: string) => string;

type ThemePalette = Readonly<{
  border: Paint;
  muted: Paint;
  text: Paint;
  heading: Paint;
  accent: Paint;
  accentFill: Paint;
  success: Paint;
  successFill: Paint;
  warning: Paint;
  danger: Paint;
  dangerFill: Paint;
  neutral: Paint;
  neutralFill: Paint;
  inverse: Paint;
}>;

export const THEME_ORDER: readonly ThemeName[] = Object.freeze(["dark", "light", "amber", "contrast"]);

const THEMES: Record<ThemeName, ThemePalette> = {
  dark: Object.freeze({
    border: chalk.hex("#5f6b7a"),
    muted: chalk.hex("#7d8590"),
    text: chalk.hex("#e6edf3"),
    heading: chalk.hex("#f8fafc"),
    accent: chalk.hex("#5cc8ff"),
    accentFill: chalk.bgHex("#5cc8ff").black,
    success: chalk.hex("#5fd38d"),
    successFill: chalk.bgHex("#5fd38d").black,
    warning: chalk.hex("#f4c95d"),
    danger: chalk.hex("#ff7676"),
    dangerFill: chalk.bgHex("#ff7676").black,
    neutral: chalk.hex("#d1d9e0"),
    neutralFill: chalk.bgHex("#d1d9e0").black,
    inverse: chalk.bgHex("#5cc8ff").black,
  }),
  light: Object.freeze({
    border: chalk.hex("#5f6b76"),
    muted: chalk.hex("#4b5563"),
    text: chalk.hex("#111827"),
    heading: chalk.hex("#030712"),
    accent: chalk.hex("#0b66d0"),
    accentFill: chalk.bgHex("#0b66d0").white,
    success: chalk.hex("#0f9f55"),
    successFill: chalk.bgHex("#0f9f55").white,
    warning: chalk.hex("#9a5d00"),
    danger: chalk.hex("#c62828"),
    dangerFill: chalk.bgHex("#c62828").white,
    neutral: chalk.hex("#1f2937"),
    neutralFill: chalk.bgHex("#64748b").white,
    inverse: chalk.bgHex("#1d4ed8").white,
  }),
  amber: Object.freeze({
    border: chalk.hex("#d6a23d"),
    muted: chalk.hex("#b38728"),
    text: chalk.hex("#ffd37a"),
    heading: chalk.hex("#ffe6a7"),
    accent: chalk.hex("#ffb000"),
    accentFill: chalk.bgHex("#ffb000").black,
    success: chalk.hex("#9ddc6f"),
    successFill: chalk.bgHex("#9ddc6f").black,
    warning: chalk.hex("#ffd37a"),
    danger: chalk.hex("#ff9b71"),
    dangerFill: chalk.bgHex("#ff9b71").black,
    neutral: chalk.hex("#ffd37a"),
    neutralFill: chalk.bgHex("#d6a23d").black,
    inverse: chalk.bgHex("#d6a23d").black,
  }),
  contrast: Object.freeze({
    border: chalk.whiteBright,
    muted: chalk.white,
    text: chalk.whiteBright,
    heading: chalk.whiteBright,
    accent: chalk.whiteBright,
    accentFill: chalk.bgWhite.black,
    success: chalk.greenBright,
    successFill: chalk.bgGreenBright.black,
    warning: chalk.yellowBright,
    danger: chalk.redBright,
    dangerFill: chalk.bgRedBright.black,
    neutral: chalk.whiteBright,
    neutralFill: chalk.bgWhite.black,
    inverse: chalk.bgWhite.black,
  }),
};

let activeThemeName: ThemeName = "dark";

export function isThemeName(value: string | undefined | null): value is ThemeName {
  return Boolean(value && (THEME_ORDER as readonly string[]).includes(value));
}

export function nextThemeName(current: ThemeName): ThemeName {
  const index = THEME_ORDER.indexOf(current);
  return THEME_ORDER[(index + 1) % THEME_ORDER.length] ?? THEME_ORDER[0];
}

export function setActiveTheme(themeName: ThemeName): void {
  activeThemeName = themeName;
}

export function getActiveThemeName(): ThemeName {
  return activeThemeName;
}

export function getThemePalette(themeName: ThemeName = activeThemeName): ThemePalette {
  return THEMES[themeName] ?? THEMES.dark;
}

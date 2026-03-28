import type { TuiRouteDefinition, ScreenRouteDeps } from "../types.js";
import { renderAccountsScreen } from "./accounts.js";
import { renderArtifactsScreen } from "./artifacts.js";
import { renderHelpScreen } from "./help.js";
import { renderLiveScreen } from "./live.js";
import { renderSettingsScreen } from "./settings.js";
import { renderUsageScreen } from "./usage.js";

export function createTuiRoutes(deps: ScreenRouteDeps): readonly TuiRouteDefinition[] {
  return Object.freeze([
    {
      id: "live",
      title: "Live",
      screen: (_params, context) => renderLiveScreen(context, deps),
    },
    {
      id: "artifacts",
      title: "Artifacts",
      screen: (_params, context) => renderArtifactsScreen(context, deps),
    },
    {
      id: "accounts",
      title: "Accounts",
      screen: (_params, context) => renderAccountsScreen(context, deps),
    },
    {
      id: "usage",
      title: "Usage",
      screen: (_params, context) => renderUsageScreen(context, deps),
    },
    {
      id: "settings",
      title: "Settings",
      screen: (_params, context) => renderSettingsScreen(context, deps),
    },
    {
      id: "help",
      title: "Help",
      screen: (_params, context) => renderHelpScreen(context, deps),
    },
  ]);
}

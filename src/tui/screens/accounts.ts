import type { RouteRenderContext, VNode } from "@rezi-ui/core";
import { ui } from "@rezi-ui/core";
import type { AccountInfo, ScreenRouteDeps, TuiState } from "../types.js";
import { renderShell } from "./shell.js";

function formatExpiry(expiresAt: number | undefined): string {
  if (!expiresAt) return "--";
  const d = new Date(expiresAt);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = [d.getHours(), d.getMinutes()].map((n) => String(n).padStart(2, "0")).join(":");
  return isToday ? `today ${time}` : d.toLocaleDateString();
}

function statusVariant(status: AccountInfo["status"]): "success" | "error" | "warning" {
  if (status === "valid") return "success";
  if (status === "expired") return "error";
  return "warning";
}

type AccountsBodyDeps = Readonly<{
  state: TuiState;
  onSelect: (id: string | null) => void;
  onAddAccount: () => void;
  onRefreshAccount: (id: string) => void;
  onRemoveAccount: (id: string) => void;
}>;

function buildAccountDetailPanel(state: TuiState, deps: AccountsBodyDeps): VNode {
  const selectedId = state.accounts.selectedId;
  const account = state.accounts.accounts.find((a) => a.id === selectedId);

  if (!account) {
    return ui.box({ border: "single", p: 1, flex: 1 }, [
      ui.text("Select an account to view details", { variant: "caption" }),
    ]);
  }

  return ui.box({ border: "single", p: 1, flex: 1 }, [
    ui.column({ gap: 1 }, [
      ui.text("Account details", { variant: "heading" }),
      ui.divider({ color: "muted" }),
      ui.row({ gap: 1 }, [
        ui.text("ID:", { variant: "caption" }),
        ui.text(account.id, { variant: "code" }),
      ]),
      ui.row({ gap: 1 }, [
        ui.text("Status:", { variant: "caption" }),
        ui.badge(account.status, { variant: statusVariant(account.status) }),
      ]),
      ui.row({ gap: 1 }, [
        ui.text("Expires:", { variant: "caption" }),
        ui.text(formatExpiry(account.expiresAt), { variant: "code" }),
      ]),
      ui.row({ gap: 1 }, [
        ui.text("Today requests:", { variant: "caption" }),
        ui.text(String(account.todayRequests), { variant: "code" }),
      ]),
      ui.divider({ color: "muted" }),
      ui.row({ gap: 1 }, [
        ui.button({
          id: "account-refresh",
          label: "Refresh",
          intent: "secondary",
          onPress: () => deps.onRefreshAccount(account.id),
        }),
        ui.button({
          id: "account-remove",
          label: "Remove",
          intent: "danger",
          onPress: () => deps.onRemoveAccount(account.id),
        }),
      ]),
    ]),
  ]);
}

function buildAccountsBody(deps: AccountsBodyDeps): VNode {
  const { state, onSelect, onAddAccount } = deps;
  const accounts = state.accounts.accounts;

  const addAccountRow = ui.row({ gap: 1, items: "center" }, [
    ui.text("Add new account", { variant: "caption" }),
    ui.button({
      id: "account-add",
      label: "+ Add account",
      intent: "primary",
      onPress: onAddAccount,
    }),
  ]);

  if (accounts.length === 0) {
    return ui.column({ gap: 1 }, [
      addAccountRow,
      ui.divider({ color: "muted" }),
      ui.text("No accounts configured", { variant: "caption" }),
      ui.callout("Add an account to start using the proxy.", { variant: "info" }),
    ]);
  }

  const tableData = accounts.map((acc) => ({
    id: acc.id,
    status: acc.status,
    expires: formatExpiry(acc.expiresAt),
    today: String(acc.todayRequests),
  }));

  return ui.column({ gap: 1, flex: 1 }, [
    addAccountRow,
    ui.divider({ color: "muted" }),
    ui.row({ gap: 1, flex: 1 }, [
      ui.box({ border: "none", flex: 1 }, [
        ui.table({
          id: "accounts-table",
          columns: [
            { key: "id", header: "ID", flex: 1 },
            { key: "status", header: "Status", width: 10 },
            { key: "expires", header: "Expires", width: 16 },
            { key: "today", header: "Today", width: 8, align: "right" },
          ],
          data: tableData,
          getRowKey: (row) => row.id,
          selection: state.accounts.selectedId ? [state.accounts.selectedId] : [],
          selectionMode: "single",
          onSelectionChange: (keys) => onSelect(keys[0] ?? null),
        }),
      ]),
      buildAccountDetailPanel(state, deps),
    ]),
    ui.divider({ color: "muted" }),
    ui.row({ gap: 2, items: "center" }, [
      ui.text("A add", { variant: "caption" }),
      ui.text("R refresh", { variant: "caption" }),
      ui.text("D remove", { variant: "caption" }),
      ui.text("Enter inspect", { variant: "caption" }),
    ]),
  ]);
}

export function renderAccountsScreen(
  context: RouteRenderContext<TuiState>,
  deps: ScreenRouteDeps & {
    onSelect: (id: string | null) => void;
    onAddAccount: () => void;
    onRefreshAccount: (id: string) => void;
    onRemoveAccount: (id: string) => void;
  },
): VNode {
  return renderShell({
    context,
    title: "Accounts",
    body: buildAccountsBody({
      state: context.state,
      onSelect: deps.onSelect,
      onAddAccount: deps.onAddAccount,
      onRefreshAccount: deps.onRefreshAccount,
      onRemoveAccount: deps.onRemoveAccount,
    }),
    onNavigate: deps.onNavigate,
    onToggleSidebar: deps.onToggleSidebar,
  });
}

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
  onOpenAuthBrowser: () => void;
  onCloseAuthModal: () => void;
  onAuthAccountIdChange: (accountId: string) => void;
  onStartAccountAuth: () => void;
  onRefreshAccount: (id: string) => void;
  onRemoveAccount: (id: string) => void;
}>;

function authVariant(phase: TuiState["accounts"]["authModal"]["phase"]): "info" | "warning" | "success" | "error" {
  if (phase === "success") return "success";
  if (phase === "failure") return "error";
  if (phase === "waiting") return "warning";
  return "info";
}

function authLabel(phase: TuiState["accounts"]["authModal"]["phase"]): string {
  if (phase === "initiating") return "PREPARING";
  if (phase === "waiting") return "WAITING";
  if (phase === "success") return "SUCCESS";
  if (phase === "failure") return "FAILED";
  return "READY";
}

function buildQrBlock(qrText: string): VNode {
  const lines = qrText.split("\n").filter((line) => line.length > 0);
  return ui.box({ border: "none", p: 0 }, [
    ui.column(
      { gap: 0 },
      lines.map((line, index) => ui.text(line, { key: `qr-${String(index)}`, variant: "code" })),
    ),
  ]);
}

function buildAuthModal(deps: AccountsBodyDeps): VNode {
  const modal = deps.state.accounts.authModal;
  const busy = modal.phase === "initiating" || modal.phase === "waiting";
  const flow = modal.flow;
  const accountId = modal.accountId;

  const content: VNode[] = [
    ui.row({ gap: 1, items: "center" }, [
      ui.badge(authLabel(modal.phase), { variant: authVariant(modal.phase) }),
      modal.message ? ui.text(modal.message, { variant: "caption" }) : null,
      busy ? ui.spinner({ variant: "dots" }) : null,
    ]),
    ui.divider({ color: "muted" }),
    busy
      ? ui.column({ gap: 1 }, [
          ui.text(`Account ID`, { variant: "caption" }),
          ui.text(accountId, { variant: "code" }),
        ])
      : ui.field({
          label: "Account ID",
          children: ui.input({
            id: "auth-account-id",
            value: accountId,
            placeholder: "e.g. work",
            onInput: (value) => deps.onAuthAccountIdChange(value),
          }),
        }),
    ui.text("Saved as ~/.qwen/oauth_creds_<account-id>.json", { variant: "caption" }),
  ];

  if (flow) {
    content.push(
      ui.divider({ color: "muted" }),
      ui.column({ gap: 1 }, [
        ui.text("Verification link", { variant: "caption" }),
        ui.text(flow.verificationUriComplete, { variant: "code", wrap: true }),
        ui.text("Device code", { variant: "caption" }),
        ui.text(flow.userCode, { variant: "heading" }),
        ui.text("Scan in terminal", { variant: "caption" }),
        buildQrBlock(flow.qrText),
      ]),
    );
  } else if (!busy) {
    content.push(
      ui.divider({ color: "muted" }),
      ui.column({ gap: 1 }, [
        ui.text("Flow", { variant: "caption" }),
        ui.text("1. Enter account ID", { variant: "caption" }),
        ui.text("2. Start auth", { variant: "caption" }),
        ui.text("3. Open link or scan QR", { variant: "caption" }),
        ui.text("4. Wait for success", { variant: "caption" }),
      ]),
    );
  }

  return ui.modal({
    id: "accounts-auth-modal",
    title: "Add account",
    width: 96,
    minWidth: 60,
    backdrop: "dim",
    closeOnBackdrop: !busy,
    closeOnEscape: !busy,
    initialFocus: busy ? "auth-close" : "auth-account-id",
    returnFocusTo: "account-add",
    content: ui.column({ gap: 1 }, content),
    actions: [
      flow
        ? ui.button({
            id: "auth-open-browser",
            label: "Open browser",
            intent: "link",
            onPress: deps.onOpenAuthBrowser,
          })
        : null,
      !busy
        ? ui.button({
            id: "auth-start",
            label: modal.phase === "failure" ? "Retry" : "Start auth",
            intent: "primary",
            onPress: deps.onStartAccountAuth,
          })
        : null,
      ui.button({
        id: "auth-close",
        label: modal.phase === "success" ? "Done" : "Close",
        intent: "secondary",
        onPress: busy ? () => undefined : deps.onCloseAuthModal,
      }),
    ].filter(Boolean) as VNode[],
    onClose: busy ? () => undefined : deps.onCloseAuthModal,
  });
}

function buildAccountDetailPanel(state: TuiState, deps: AccountsBodyDeps): VNode {
  const selectedId = state.accounts.selectedId;
  const account = state.accounts.accounts.find((a) => a.id === selectedId);

  if (!account) {
    return ui.column({ gap: 1, flex: 1 }, [
      ui.text("Account details", { variant: "heading" }),
      ui.divider({ color: "muted" }),
      ui.text("Select an account to view details", { variant: "caption" }),
    ]);
  }

  return ui.box({ border: "none", p: 0, flex: 1 }, [
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
      ui.actions([
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
      ui.text("No accounts configured", { variant: "heading" }),
      ui.text("Add an account to start using the proxy.", { variant: "caption" }),
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
          border: "none",
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
    onOpenAuthBrowser: () => void;
    onCloseAuthModal: () => void;
    onAuthAccountIdChange: (accountId: string) => void;
    onStartAccountAuth: () => void;
    onRefreshAccount: (id: string) => void;
    onRemoveAccount: (id: string) => void;
  },
): VNode {
  const shell = renderShell({
    context,
    title: "Accounts",
    body: buildAccountsBody({
      state: context.state,
      onSelect: deps.onSelect,
      onAddAccount: deps.onAddAccount,
      onOpenAuthBrowser: deps.onOpenAuthBrowser,
      onCloseAuthModal: deps.onCloseAuthModal,
      onAuthAccountIdChange: deps.onAuthAccountIdChange,
      onStartAccountAuth: deps.onStartAccountAuth,
      onRefreshAccount: deps.onRefreshAccount,
      onRemoveAccount: deps.onRemoveAccount,
    }),
    onNavigate: deps.onNavigate,
    onToggleSidebar: deps.onToggleSidebar,
  });

  if (!context.state.accounts.authModal.isOpen) {
    return shell;
  }

  return ui.layers([
    shell,
    buildAuthModal({
      state: context.state,
      onSelect: deps.onSelect,
      onAddAccount: deps.onAddAccount,
      onOpenAuthBrowser: deps.onOpenAuthBrowser,
      onCloseAuthModal: deps.onCloseAuthModal,
      onAuthAccountIdChange: deps.onAuthAccountIdChange,
      onStartAccountAuth: deps.onStartAccountAuth,
      onRefreshAccount: deps.onRefreshAccount,
      onRemoveAccount: deps.onRemoveAccount,
    }),
  ]);
}

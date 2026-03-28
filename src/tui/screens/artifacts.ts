import type { RouteRenderContext, VNode } from "@rezi-ui/core";
import { ui } from "@rezi-ui/core";
import type { ArtifactNode, ScreenRouteDeps, TuiState } from "../types.js";
import { renderShell } from "./shell.js";

type FileNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
};

function toFileNodes(artifacts: readonly ArtifactNode[]): FileNode[] {
  return artifacts.map((a) => ({
    name: a.name,
    path: a.path,
    type: a.type,
    children: a.children ? toFileNodes(a.children) : undefined,
  }));
}

function formatSize(bytes: number | undefined): string {
  if (bytes === undefined) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type ArtifactsBodyDeps = Readonly<{
  state: TuiState;
  onToggleExpand: (path: string) => void;
  onSelect: (path: string | null) => void;
  onActivate: (path: string) => void;
}>;

function findNode(nodes: readonly ArtifactNode[], path: string): ArtifactNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.children) {
      const found = findNode(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

function buildPreviewPane(state: TuiState): VNode {
  const selected = state.artifacts.selected;
  const preview = state.artifacts.previewContent;

  if (!selected) {
    return ui.column({ gap: 1, flex: 1 }, [
      ui.text("Preview", { variant: "heading" }),
      ui.divider({ color: "muted" }),
      ui.text("Select a file to preview", { variant: "caption" }),
    ]);
  }

  const node = findNode(state.artifacts.tree, selected);
  const isDir = node?.type === "directory";

  return ui.box({ border: "none", p: 0, flex: 1 }, [
    ui.column({ gap: 1 }, [
      ui.text("Preview", { variant: "heading" }),
      ui.divider({ color: "muted" }),
      ui.row({ gap: 1, items: "center" }, [
        ui.text("path:", { variant: "caption" }),
        ui.text(selected, { variant: "code" }),
      ]),
      ui.row({ gap: 1, items: "center" }, [
        ui.text("type:", { variant: "caption" }),
        ui.text(isDir ? "directory" : "file", { variant: "code" }),
      ]),
      node?.size !== undefined
        ? ui.row({ gap: 1, items: "center" }, [
            ui.text("size:", { variant: "caption" }),
            ui.text(formatSize(node.size), { variant: "code" }),
          ])
        : null,
      ui.divider({ color: "muted" }),
      preview
        ? ui.text(preview, { variant: "code", wrap: true })
        : ui.text(isDir ? "Directory selected" : "Loading preview...", { variant: "caption" }),
    ]),
  ]);
}

function buildArtifactsBody(deps: ArtifactsBodyDeps): VNode {
  const { state, onToggleExpand, onSelect, onActivate } = deps;
  const tree = state.artifacts.tree;

  if (tree.length === 0) {
    return ui.column({ gap: 1 }, [
      ui.text("No artifacts yet", { variant: "heading" }),
      ui.divider({ color: "muted" }),
      ui.text("Request artifacts will appear here after the server processes debug-enabled requests.", {
        variant: "caption",
      }),
      ui.text("Enable DEBUG_LOG=true to capture request artifacts.", { variant: "caption" }),
    ]);
  }

  const fileNodes = toFileNodes(tree);

  return ui.row({ gap: 1, flex: 1 }, [
    ui.box({ border: "none", p: 0, width: 40 }, [
      ui.column({ gap: 0 }, [
        ui.text("Request artifacts", { variant: "heading" }),
        ui.divider({ color: "muted" }),
        ui.fileTreeExplorer({
          id: "artifacts-tree",
          data: fileNodes,
          expanded: [...state.artifacts.expanded],
          selected: state.artifacts.selected ?? undefined,
          showIcons: true,
          showStatus: false,
          onChange: (node, expanded) => {
            if (expanded) {
              onToggleExpand(node.path);
            } else {
              onToggleExpand(node.path);
            }
          },
          onSelect: (node) => onSelect(node.path),
          onPress: (node) => onActivate(node.path),
        }),
      ]),
    ]),
    ui.box({ border: "none", width: 1, py: 0 }, [ui.divider({ direction: "vertical", color: "muted" })]),
    buildPreviewPane(state),
  ]);
}

export function renderArtifactsScreen(
  context: RouteRenderContext<TuiState>,
  deps: ScreenRouteDeps & {
    onToggleExpand: (path: string) => void;
    onSelect: (path: string | null) => void;
    onActivate: (path: string) => void;
  },
): VNode {
  return renderShell({
    context,
    title: "Artifacts",
    body: buildArtifactsBody({
      state: context.state,
      onToggleExpand: deps.onToggleExpand,
      onSelect: deps.onSelect,
      onActivate: deps.onActivate,
    }),
    onNavigate: deps.onNavigate,
    onToggleSidebar: deps.onToggleSidebar,
  });
}

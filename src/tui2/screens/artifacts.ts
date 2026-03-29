import chalk from "chalk";
import type { ArtifactNode, TuiState } from "../types.js";
import { caption, hRule, muted, sectionHeader, truncLine } from "../render.js";

export const ARTIFACT_TREE_START_ROW = 4;

export type VisibleArtifactRow = Readonly<{
  path: string;
  depth: number;
  type: ArtifactNode["type"];
  name: string;
  size?: number;
  expanded?: boolean;
}>;

function formatSize(bytes: number | undefined): string {
  if (bytes === undefined) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function artifactPaneWidths(width: number): { treeWidth: number; previewWidth: number } {
  const treeWidth = Math.max(24, Math.floor(width * 0.42));
  return {
    treeWidth,
    previewWidth: Math.max(20, width - treeWidth - 1),
  };
}

export function flattenArtifactRows(
  nodes: readonly ArtifactNode[],
  expanded: readonly string[],
  depth = 0,
  rows: VisibleArtifactRow[] = [],
): readonly VisibleArtifactRow[] {
  for (const node of nodes) {
    const isDir = node.type === "directory";
    const isExpanded = expanded.includes(node.path);
    rows.push(Object.freeze({
      path: node.path,
      depth,
      type: node.type,
      name: node.name,
      size: node.size,
      expanded: isExpanded,
    }));

    if (isDir && isExpanded && node.children) {
      flattenArtifactRows(node.children, expanded, depth + 1, rows);
    }
  }

  return rows;
}

function renderTree(rows: readonly VisibleArtifactRow[], selected: string | null, width: number, lines: string[]): void {
  for (const row of rows) {
    const indent = "  ".repeat(row.depth);
    const isDir = row.type === "directory";
    const icon = isDir ? (row.expanded ? "▼" : "▶") : "•";
    const sizeStr = !isDir && row.size !== undefined ? muted(` (${formatSize(row.size)})`) : "";
    const nameStr = isDir ? chalk.bold(row.name) : row.name;
    const raw = `${indent}${muted(icon)} ${nameStr}${sizeStr}`;
    lines.push(truncLine(row.path === selected ? chalk.inverse(raw) : raw, width));
  }
}

export function renderArtifactsScreen(state: TuiState, termRows: number, width: number): string[] {
  const lines: string[] = [];
  const { tree, expanded, selected, previewContent } = state.artifacts;

  lines.push(sectionHeader("Artifacts", width));
  lines.push(hRule(width));

  if (tree.length === 0) {
    lines.push(muted("  no artifacts yet — enable DEBUG_LOG=true and send a request"));
    return lines;
  }

  const { treeWidth, previewWidth } = artifactPaneWidths(width);

  lines.push(truncLine(chalk.bold(muted("Files").padEnd(treeWidth)) + muted("│") + chalk.bold("Preview"), width));
  lines.push(hRule(width));

  const visibleRows = flattenArtifactRows(tree, expanded);
  const treeLines: string[] = [];
  renderTree(visibleRows, selected, treeWidth, treeLines);

  const previewLines: string[] = [];
  if (selected) {
    previewLines.push(muted(selected));
    if (previewContent) {
      const content = previewContent.split("\n").slice(0, termRows - 6);
      previewLines.push(...content.map((l) => truncLine(l, previewWidth)));
    } else {
      previewLines.push(muted("select a file to preview"));
    }
  } else {
    previewLines.push(muted("select a file to preview"));
  }

  const maxRows = Math.max(treeLines.length, previewLines.length);
  for (let i = 0; i < maxRows; i++) {
    const l = (treeLines[i] ?? "").padEnd(treeWidth).slice(0, treeWidth);
    const r = truncLine(previewLines[i] ?? "", previewWidth);
    lines.push(l + muted("│") + r);
  }

  lines.push(hRule(width));
  lines.push(truncLine(caption("  ↑↓ select  Enter open  Click select  Wheel scroll"), width));

  return lines;
}

import chalk from "chalk";
import type { ArtifactNode, TuiState } from "../types.js";
import { caption, hRule, muted, sectionHeader, truncLine } from "../render.js";

function formatSize(bytes: number | undefined): string {
  if (bytes === undefined) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function renderTree(
  nodes: readonly ArtifactNode[],
  expanded: readonly string[],
  selected: string | null,
  depth: number,
  width: number,
  lines: string[],
): void {
  for (const node of nodes) {
    const indent = "  ".repeat(depth);
    const isDir = node.type === "directory";
    const isExpanded = expanded.includes(node.path);
    const isSelected = node.path === selected;
    const icon = isDir ? (isExpanded ? "▼" : "▶") : " ";
    const sizeStr = !isDir && node.size !== undefined ? muted(` (${formatSize(node.size)})`) : "";
    const nameStr = isDir ? chalk.bold(node.name) : node.name;
    const raw = `${indent}${muted(icon)} ${nameStr}${sizeStr}`;
    lines.push(truncLine(isSelected ? chalk.inverse(raw) : raw, width));

    if (isDir && isExpanded && node.children) {
      renderTree(node.children, expanded, selected, depth + 1, width, lines);
    }
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

  const splitW = Math.floor(width * 0.4);
  const previewW = width - splitW - 1;

  lines.push(truncLine(chalk.bold(muted("Files").padEnd(splitW)) + muted("│") + chalk.bold("Preview"), width));
  lines.push(hRule(width));

  const treeLines: string[] = [];
  renderTree(tree, expanded, selected, 0, splitW, treeLines);

  const previewLines: string[] = [];
  if (selected) {
    previewLines.push(muted(selected));
    if (previewContent) {
      const content = previewContent.split("\n").slice(0, termRows - 6);
      previewLines.push(...content.map((l) => truncLine(l, previewW)));
    } else {
      previewLines.push(muted("loading..."));
    }
  } else {
    previewLines.push(muted("select a file to preview"));
  }

  const maxRows = Math.max(treeLines.length, previewLines.length);
  for (let i = 0; i < maxRows; i++) {
    const l = (treeLines[i] ?? "").padEnd(splitW).slice(0, splitW);
    const r = truncLine(previewLines[i] ?? "", previewW);
    lines.push(l + muted("│") + r);
  }

  lines.push(hRule(width));
  lines.push(truncLine(caption("  ↑↓ select  Enter expand/collapse"), width));

  return lines;
}

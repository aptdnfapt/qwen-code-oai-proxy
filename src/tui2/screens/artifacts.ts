import type { ArtifactNode, TuiState } from "../types.js";
import { border, caption, hRule, highlight, muted, padRight, sectionHeader, selected, strong, truncLine } from "../render.js";

export const ARTIFACT_BODY_START_ROW = 6;

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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function childCount(node: ArtifactNode | null): number {
  return node?.children?.length ?? 0;
}

function countDescendants(node: ArtifactNode | null): number {
  if (!node?.children || node.children.length === 0) {
    return 0;
  }

  let total = node.children.length;
  for (const child of node.children) {
    total += countDescendants(child);
  }
  return total;
}

export function artifactPaneWidths(width: number): { treeWidth: number; previewWidth: number } {
  const innerWidth = Math.max(20, width - 3);
  const treeWidth = Math.max(28, Math.floor(innerWidth * 0.42));
  return {
    treeWidth,
    previewWidth: Math.max(28, innerWidth - treeWidth),
  };
}

export function filterArtifactTree(nodes: readonly ArtifactNode[], query: string): readonly ArtifactNode[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return nodes;
  }

  const filtered: ArtifactNode[] = [];

  for (const node of nodes) {
    const selfMatch = node.path.toLowerCase().includes(trimmed) || node.name.toLowerCase().includes(trimmed);
    const filteredChildren = node.children ? filterArtifactTree(node.children, query) : undefined;
    if (selfMatch || (filteredChildren && filteredChildren.length > 0)) {
      filtered.push(Object.freeze({
        ...node,
        children: filteredChildren,
      }));
    }
  }

  return Object.freeze(filtered);
}

export function flattenArtifactRows(
  nodes: readonly ArtifactNode[],
  expanded: readonly string[],
  depth = 0,
  rows: VisibleArtifactRow[] = [],
): readonly VisibleArtifactRow[] {
  for (const node of nodes) {
    const isExpanded = expanded.includes(node.path);
    rows.push(Object.freeze({
      path: node.path,
      depth,
      type: node.type,
      name: node.name,
      size: node.size,
      expanded: isExpanded,
    }));

    if (node.type === "directory" && isExpanded && node.children) {
      flattenArtifactRows(node.children, expanded, depth + 1, rows);
    }
  }

  return rows;
}

export function getVisibleArtifactRows(
  tree: readonly ArtifactNode[],
  expanded: readonly string[],
  filterQuery: string,
): readonly VisibleArtifactRow[] {
  return flattenArtifactRows(filterArtifactTree(tree, filterQuery), expanded);
}

function findArtifactNodeByPath(nodes: readonly ArtifactNode[], path: string | null): ArtifactNode | null {
  if (!path) {
    return null;
  }

  for (const node of nodes) {
    if (node.path === path) {
      return node;
    }
    if (node.children) {
      const nested = findArtifactNodeByPath(node.children, path);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

function renderTreeRow(row: VisibleArtifactRow, isSelected: boolean, width: number): string {
  const indent = "  ".repeat(row.depth);
  const icon = row.type === "directory" ? (row.expanded ? "▼" : "▶") : "•";
  const sizeStr = row.type === "file" && row.size !== undefined ? muted(` ${formatSize(row.size)}`) : "";
  const base = `${indent}${muted(icon)} ${row.type === "directory" ? strong(row.name) : row.name}${sizeStr}`;

  if (!isSelected) {
    return truncLine(padRight(base, width), width);
  }

  return truncLine(selected(padRight(base, width)), width);
}

function previewLinesForSelection(selectedNode: ArtifactNode | null, previewContent: string | null, previewWidth: number): readonly string[] {
  if (!selectedNode) {
    return Object.freeze([
      muted("no artifact selected"),
      muted("pick a request folder or file from the tree"),
    ]);
  }

  if (selectedNode.type === "directory") {
    const childLines = (selectedNode.children ?? []).slice(0, 40).map((child) =>
      truncLine(`${child.type === "directory" ? "▶" : "•"} ${child.name}${child.size ? `  ${formatSize(child.size)}` : ""}`, previewWidth),
    );

    return Object.freeze([
      `path: ${selectedNode.path}`,
      `type: directory`,
      `items: ${String(childCount(selectedNode))}`,
      `descendants: ${String(countDescendants(selectedNode))}`,
      "",
      muted("open the folder or pick a file to inspect its contents"),
      "",
      truncLine("children:", previewWidth),
      ...childLines,
    ].map((line) => truncLine(line, previewWidth)));
  }

  const contentLines = (previewContent ?? "").split("\n").map((line) => truncLine(line, previewWidth));
  const metadata = [
    `path: ${selectedNode.path}`,
    `type: file`,
    `size: ${formatSize(selectedNode.size) || "--"}`,
    `lines: ${String(contentLines.length)}`,
    "",
  ].map((line) => truncLine(line, previewWidth));

  if (!previewContent) {
    metadata.push(muted("loading preview..."));
  }

  return Object.freeze([...metadata, ...contentLines]);
}

export function renderArtifactsScreen(state: TuiState, termRows: number, width: number): string[] {
  const lines: string[] = [];
  const { tree, expanded, selected, previewContent, filterQuery, previewScrollTop, activePane } = state.artifacts;

  lines.push(sectionHeader("Artifacts", width));
  lines.push(hRule(width));

  if (tree.length === 0) {
    lines.push(muted("  no artifacts yet — enable DEBUG_LOG=true and send a request"));
    return lines;
  }

  const { treeWidth, previewWidth } = artifactPaneWidths(width);
  const visibleRows = getVisibleArtifactRows(tree, expanded, filterQuery);
  const selectedPath = visibleRows.some((row) => row.path === selected) ? selected : (visibleRows[0]?.path ?? null);
  const selectedIndex = Math.max(0, visibleRows.findIndex((row) => row.path === selectedPath));
  const selectedNode = findArtifactNodeByPath(tree, selectedPath);
  const previewAllLines = previewLinesForSelection(selectedNode, previewContent, previewWidth);
  const footerRows = 2;
  const fixedRows = lines.length + 4 + footerRows;
  const bodyRows = Math.max(8, termRows - fixedRows);
  const treeScrollTop = clamp(selectedIndex - Math.floor(bodyRows / 2), 0, Math.max(0, visibleRows.length - bodyRows));
  const previewTop = clamp(previewScrollTop, 0, Math.max(0, previewAllLines.length - bodyRows));
  const previewEnd = Math.min(previewAllLines.length, previewTop + bodyRows);
  const status = [
    `  / search: ${filterQuery || "all"}`,
    `results ${String(visibleRows.length)}`,
    `pane ${activePane}`,
    `selected ${selectedPath ?? "none"}`,
  ].join("   ");

  lines.push(truncLine(caption(status), width));

  const top = border(`┌${"─".repeat(treeWidth)}┬${"─".repeat(previewWidth)}┐`);
  const header =
    `${border("│")}${padRight(truncLine(activePane === "tree" ? highlight("Files") : strong("Files"), treeWidth), treeWidth)}${border("│")}` +
    `${padRight(truncLine(activePane === "preview" ? highlight("Preview") : strong("Preview"), previewWidth), previewWidth)}${border("│")}`;
  const divider = border(`├${"─".repeat(treeWidth)}┼${"─".repeat(previewWidth)}┤`);

  lines.push(truncLine(top, width));
  lines.push(truncLine(header, width));
  lines.push(truncLine(divider, width));

  for (let index = 0; index < bodyRows; index++) {
    const row = visibleRows[treeScrollTop + index] ?? null;
    const left = row ? renderTreeRow(row, row.path === selectedPath, treeWidth) : "";
    const right = previewAllLines[previewTop + index] ?? "";
    lines.push(
      truncLine(
        `${border("│")}${padRight(left, treeWidth)}${border("│")}${padRight(right, previewWidth)}${border("│")}`,
        width,
      ),
    );
  }

  lines.push(truncLine(border(`└${"─".repeat(treeWidth)}┴${"─".repeat(previewWidth)}┘`), width));
  lines.push(truncLine(caption(`  ↑↓ move  ←→ pane  PgUp/PgDn preview  / search  Esc clear  ${String(previewTop + 1)}-${String(previewEnd)}/${String(previewAllLines.length || 1)}`), width));

  return lines;
}

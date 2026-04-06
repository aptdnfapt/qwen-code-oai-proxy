const WINDOWS_VIEWPORT_ROW_OFFSET = process.platform === "win32" ? 1 : 0;

export function getViewportRows(rows: number | undefined, fallback = 40): number {
  const resolved = rows ?? fallback;

  // Windows terminals appear to report one more row than is actually visible.
  return Math.max(1, resolved - WINDOWS_VIEWPORT_ROW_OFFSET);
}

export function getViewportSize(cols: number | undefined, rows: number | undefined): { cols: number; rows: number } {
  return {
    cols: cols ?? 120,
    rows: getViewportRows(rows),
  };
}

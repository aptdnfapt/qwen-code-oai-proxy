export interface MouseEvent {
  button: number;
  col: number;
  row: number;
  release: boolean;
  wheel: "up" | "down" | null;
  move: boolean;
}

export function parseMouse(data: string): MouseEvent | null {
  const match = data.match(/^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/);
  if (!match) return null;
  const rawButton = parseInt(match[1]!, 10);
  const wheel = (rawButton & 64) !== 0
    ? ((rawButton & 1) === 0 ? "up" : "down")
    : null;
  return {
    button: rawButton & 3,
    col: parseInt(match[2]!, 10) - 1,
    row: parseInt(match[3]!, 10) - 1,
    release: match[4] === "m",
    wheel,
    move: (rawButton & 32) !== 0,
  };
}

export function enableMouse(write: (s: string) => void): void {
  write("\x1b[?1000h\x1b[?1002h\x1b[?1006h");
}

export function disableMouse(write: (s: string) => void): void {
  write("\x1b[?1000l\x1b[?1002l\x1b[?1006l");
}

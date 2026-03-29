export interface MouseEvent {
  button: number;
  col: number;
  row: number;
  release: boolean;
}

export function parseMouse(data: string): MouseEvent | null {
  const match = data.match(/^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/);
  if (!match) return null;
  return {
    button: parseInt(match[1]!, 10),
    col: parseInt(match[2]!, 10) - 1,
    row: parseInt(match[3]!, 10) - 1,
    release: match[4] === "m",
  };
}

export function enableMouse(write: (s: string) => void): void {
  write("\x1b[?1000h\x1b[?1006h");
}

export function disableMouse(write: (s: string) => void): void {
  write("\x1b[?1000l\x1b[?1006l");
}

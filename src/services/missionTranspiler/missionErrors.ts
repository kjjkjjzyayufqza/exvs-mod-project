export class MissionError extends Error {
  constructor(message: string, public readonly line?: number, public readonly column?: number) {
    super(line ? `${message} (line ${line}, column ${column})` : message);
    this.name = "MissionError";
  }
}

export const MAX_SOURCE_LENGTH = 512 * 1024;

export function boundedInteger(
  value: number,
  path: string,
  min = 0,
  max = 0xffffffff,
): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new MissionError(`${path}: expected an integer in ${min}..${max}`);
  }
  return value;
}

/** Partial decimal typing: optional leading minus, digits, one dot. */
const DECIMAL_PARTIAL = /^-?\d*(\.\d*)?$/;

export function sanitizeDecimalInput(raw: string): string {
  let text = raw.replace(/[^\d.\-]/g, "");
  if (!text) return "";

  const negative = text.startsWith("-");
  text = text.replace(/-/g, "");
  if (negative) text = `-${text}`;

  const dotIndex = text.indexOf(".");
  if (dotIndex !== -1) {
    const head = text.slice(0, dotIndex + 1);
    const tail = text.slice(dotIndex + 1).replace(/\./g, "");
    text = head + tail;
  }

  return DECIMAL_PARTIAL.test(text) ? text : "";
}

export function isCompleteDecimalInput(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed === "-" || trimmed === "." || trimmed === "-.") return false;
  return Number.isFinite(Number.parseFloat(trimmed));
}

export function commitDecimalInput(raw: string, fallback: string): string {
  const sanitized = sanitizeDecimalInput(raw);
  if (isCompleteDecimalInput(sanitized)) return sanitized;
  return fallback;
}

export function sanitizeIntegerInput(raw: string): string {
  if (!raw) return "";
  const negative = raw.trimStart().startsWith("-");
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return negative ? "-" : "";
  return negative ? `-${digits}` : digits;
}

export function commitIntegerInput(raw: string, fallback: string): string {
  const sanitized = sanitizeIntegerInput(raw);
  if (!sanitized || sanitized === "-") return fallback;
  return sanitized;
}

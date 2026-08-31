const LENGTH_TO_MM: Record<string, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
  inch: 25.4,
  ft: 304.8,
};

const VOLTAGE_UNITS = ["v", "volt", "volts"];

export function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value !== "string") return null;

  const cleaned = value.replace(/\s/g, "").replace(",", ".");
  const match = cleaned.match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function parseLengthToMm(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;

  const normalized = value.toLowerCase().trim();
  const match = normalized.match(/(-?\d+(?:[.,]\d+)?)\s*([a-z]+)?/);
  if (!match) return null;

  const amount = Number(match[1].replace(",", "."));
  const unit = match[2] ?? "mm";
  const factor = LENGTH_TO_MM[unit];
  return factor ? amount * factor : amount;
}

export function parseVoltage(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;

  const normalized = value.toLowerCase().trim();
  const num = parseNumber(normalized);
  if (num === null) return null;

  const hasUnit = VOLTAGE_UNITS.some((unit) => normalized.includes(unit));
  return hasUnit || !normalized.match(/[a-z]/) ? num : num;
}

export function trim(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str.length > 0 ? str : null;
}

export function uppercase(value: unknown): string | null {
  const str = trim(value);
  return str ? str.toUpperCase() : null;
}

export function lowercase(value: unknown): string | null {
  const str = trim(value);
  return str ? str.toLowerCase() : null;
}

const TRANSFORMS: Record<string, (value: unknown) => unknown> = {
  trim,
  uppercase,
  lowercase,
  parseNumber,
  parseVoltage,
  parseLength: parseLengthToMm,
  toMm: parseLengthToMm,
};

export function applyTransform(name: string, value: unknown): unknown {
  const fn = TRANSFORMS[name];
  if (!fn) {
    throw new Error(`Unknown transform: ${name}`);
  }
  return fn(value);
}

export function applyTransforms(value: unknown, transforms: string[]): unknown {
  return transforms.reduce((current, transform) => applyTransform(transform, current), value);
}

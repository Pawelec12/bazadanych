import { createHash } from "node:crypto";

export function computeContentHash(payload: Record<string, unknown>): string {
  const normalized = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash("sha256").update(normalized).digest("hex");
}

export function computeFileHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

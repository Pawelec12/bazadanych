import { join } from "node:path";

export function getConfigDir(): string {
  if (process.env.CONFIG_DIR) {
    return process.env.CONFIG_DIR;
  }

  // Monorepo root: apps/web -> ../../configs/manufacturers
  // Also works when cwd is repo root during scripts
  const candidates = [
    join(process.cwd(), "configs", "manufacturers"),
    join(process.cwd(), "..", "..", "configs", "manufacturers"),
    join(process.cwd(), "..", "..", "..", "configs", "manufacturers"),
  ];

  return candidates[1];
}

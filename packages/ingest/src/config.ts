import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import yaml from "js-yaml";

export interface ColumnMapping {
  source: string;
  transform?: string[];
}

export interface CategoryRule {
  match: {
    column: string;
    equals?: string;
    contains?: string;
  };
  category: string;
}

export interface ManufacturerConfig {
  manufacturer: string;
  displayName?: string;
  filePattern: string;
  delimiter?: string;
  encoding?: string;
  sheetName?: string;
  rootElement?: string;
  columns: Record<string, ColumnMapping | string>;
  categoryRules?: CategoryRule[];
  requiredFields?: string[];
}

export function loadManufacturerConfig(configPath: string): ManufacturerConfig {
  const content = readFileSync(configPath, "utf8");
  return yaml.load(content) as ManufacturerConfig;
}

export function loadManufacturerConfigs(configDir: string): ManufacturerConfig[] {
  return readdirSync(configDir)
    .filter((file: string) => file.endsWith(".yaml") || file.endsWith(".yml"))
    .map((file: string) => loadManufacturerConfig(join(configDir, file)));
}

export function matchConfigForFile(
  configs: ManufacturerConfig[],
  fileName: string
): ManufacturerConfig | null {
  const name = basename(fileName);
  for (const config of configs) {
    const pattern = config.filePattern
      .replace(/\./g, "\\.")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".");
    const regex = new RegExp(`^${pattern}$`, "i");
    if (regex.test(name)) {
      return config;
    }
  }
  return null;
}

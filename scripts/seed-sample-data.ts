import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "@pkb/db";
import { ingestFile } from "@pkb/ingest";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const db = createDb();
  const configPath = join(__dirname, "../configs/manufacturers/acme-industrial.yaml");
  const samplePath = join(__dirname, "sample-data/acme_sample.csv");
  const buffer = readFileSync(samplePath);

  const result = await ingestFile(db, "acme_sample.csv", buffer, { configPath });
  console.log("Seed complete:", result);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

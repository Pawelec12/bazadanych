import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "@pkb/db";
import { hybridSearch } from "@pkb/search";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface LabeledQuery {
  query: string;
  expectedCatalogNumbers: string[];
}

async function main() {
  const db = createDb();
  const labelsPath = join(__dirname, "search-labels.json");
  const labels = JSON.parse(readFileSync(labelsPath, "utf8")) as LabeledQuery[];

  let totalHits = 0;
  let totalExpected = 0;

  for (const label of labels) {
    const response = await hybridSearch(db, {
      query: label.query,
      limit: 5,
      explain: false,
    });

    const found = new Set(response.results.map((r) => r.catalogNumber));
    const hits = label.expectedCatalogNumbers.filter((sku) => found.has(sku)).length;

    totalHits += hits;
    totalExpected += label.expectedCatalogNumbers.length;

    console.log(
      JSON.stringify({
        query: label.query,
        hits,
        expected: label.expectedCatalogNumbers.length,
        top: response.results.slice(0, 3).map((r) => r.catalogNumber),
      })
    );
  }

  const precisionAt5 = totalExpected === 0 ? 0 : totalHits / totalExpected;
  console.log(`\nPrecision@5: ${(precisionAt5 * 100).toFixed(1)}%`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

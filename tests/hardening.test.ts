import { describe, expect, it } from "vitest";
import { computeContentHash, computeFileHash } from "../packages/ingest/src/hash";
import { normalizeRow } from "../packages/ingest/src/normalize";
import type { ManufacturerConfig } from "../packages/ingest/src/config";
import { reciprocalRankFusion, computeConfidence } from "../packages/search/src/scoring";

const sampleConfig: ManufacturerConfig = {
  manufacturer: "test",
  filePattern: "*.csv",
  columns: {
    catalog_number: { source: "ArtNr", transform: ["trim", "uppercase"] },
    name: { source: "Bezeichnung", transform: ["trim"] },
    voltage: { source: "Spannung", transform: ["parseVoltage"] },
  },
};

describe("hash", () => {
  it("produces stable content hashes", () => {
    const a = computeContentHash({ catalogNumber: "A1", name: "Bolt" });
    const b = computeContentHash({ catalogNumber: "A1", name: "Bolt" });
    const c = computeContentHash({ catalogNumber: "A1", name: "Screw" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("hashes file buffers", () => {
    const hash = computeFileHash(Buffer.from("hello"));
    expect(hash).toHaveLength(64);
  });
});

describe("normalizeRow", () => {
  it("normalizes a valid row", () => {
    const result = normalizeRow(
      {
        sourceRow: 2,
        rawFields: {
          ArtNr: " acme-1 ",
          Bezeichnung: "Hex Bolt",
          Spannung: "24V",
        },
        parseErrors: [],
      },
      sampleConfig
    );

    expect(result.errors).toHaveLength(0);
    expect(result.product?.catalogNumber).toBe("ACME-1");
    expect(result.product?.attributes.voltage).toBe(24);
  });

  it("rejects missing catalog number", () => {
    const result = normalizeRow(
      {
        sourceRow: 2,
        rawFields: { Bezeichnung: "Hex Bolt" },
        parseErrors: [],
      },
      sampleConfig
    );

    expect(result.product).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("scoring", () => {
  it("merges ranked lists with RRF", () => {
    const fused = reciprocalRankFusion([
      [{ id: "a" }, { id: "b" }],
      [{ id: "b" }, { id: "c" }],
    ]);

    expect(fused.get("b")).toBeGreaterThan(fused.get("a") ?? 0);
    expect(fused.get("b")).toBeGreaterThan(fused.get("c") ?? 0);
  });

  it("boosts exact matches in confidence", () => {
    const exact = computeConfidence({
      exactMatch: true,
      semanticSimilarity: 0.2,
      filterCompleteness: 0.5,
      enrichmentConfidence: 0.5,
      attributeCompleteness: 0.5,
      daysSinceUpdate: 0,
    });

    const fuzzy = computeConfidence({
      exactMatch: false,
      semanticSimilarity: 0.2,
      filterCompleteness: 0.5,
      enrichmentConfidence: 0.5,
      attributeCompleteness: 0.5,
      daysSinceUpdate: 0,
    });

    expect(exact.confidence).toBeGreaterThan(fuzzy.confidence);
  });
});

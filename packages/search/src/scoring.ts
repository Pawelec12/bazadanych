const RRF_K = 60;

export function reciprocalRankFusion(
  rankedLists: Array<Array<{ id: string; score?: number }>>,
  weights: number[] = []
): Map<string, number> {
  const scores = new Map<string, number>();

  rankedLists.forEach((list, listIndex) => {
    const weight = weights[listIndex] ?? 1;
    list.forEach((item, rank) => {
      const rrf = weight * (1 / (RRF_K + rank + 1));
      scores.set(item.id, (scores.get(item.id) ?? 0) + rrf);
    });
  });

  return scores;
}

export interface ConfidenceInput {
  exactMatch: boolean;
  semanticSimilarity: number;
  filterCompleteness: number;
  enrichmentConfidence: number;
  attributeCompleteness: number;
  daysSinceUpdate: number;
}

export function computeConfidence(input: ConfidenceInput): {
  confidence: number;
  explanation: {
    exactMatchBoost: number;
    semanticSimilarity: number;
    filterCompleteness: number;
    dataQuality: number;
    freshness: number;
    rrfScore: number;
    channels: string[];
    matchedFields: string[];
  };
} {
  const exactMatchBoost = input.exactMatch ? 1 : 0;
  const semanticSimilarity = Math.max(0, Math.min(1, input.semanticSimilarity));
  const filterCompleteness = Math.max(0, Math.min(1, input.filterCompleteness));
  const dataQuality =
    Math.max(0, Math.min(1, input.enrichmentConfidence)) *
    Math.max(0, Math.min(1, input.attributeCompleteness));
  const freshness = Math.max(0, 1 - input.daysSinceUpdate / 365);

  const confidence =
    exactMatchBoost * 0.4 +
    semanticSimilarity * 0.25 +
    filterCompleteness * 0.15 +
    dataQuality * 0.15 +
    freshness * 0.05;

  return {
    confidence: Math.max(0, Math.min(1, confidence)),
    explanation: {
      exactMatchBoost,
      semanticSimilarity,
      filterCompleteness,
      dataQuality,
      freshness,
      rrfScore: 0,
      channels: [],
      matchedFields: [],
    },
  };
}

export function attributeCompleteness(attributes: Record<string, unknown>): number {
  const keys = Object.keys(attributes).filter((key) => key !== "_raw");
  if (keys.length === 0) return 0.3;
  const filled = keys.filter((key) => {
    const value = attributes[key];
    return value !== null && value !== undefined && value !== "";
  });
  return filled.length / keys.length;
}

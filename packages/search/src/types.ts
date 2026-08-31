export interface SearchFilters {
  manufacturerId?: string;
  categoryId?: string;
  categorySlug?: string;
  attributes?: Record<string, unknown>;
}

export interface SearchRequest {
  query: string;
  filters?: SearchFilters;
  limit?: number;
  explain?: boolean;
  channels?: Array<"exact" | "semantic" | "filter">;
}

export interface ScoreExplanation {
  exactMatchBoost: number;
  semanticSimilarity: number;
  filterCompleteness: number;
  dataQuality: number;
  freshness: number;
  rrfScore: number;
  channels: string[];
  matchedFields: string[];
}

export interface SearchResultItem {
  productId: string;
  catalogNumber: string;
  name: string;
  description: string | null;
  manufacturerId: string;
  categoryId: string | null;
  attributes: Record<string, unknown>;
  confidence: number;
  explanation?: ScoreExplanation;
}

export interface SearchResponse {
  results: SearchResultItem[];
  total: number;
  query: string;
}

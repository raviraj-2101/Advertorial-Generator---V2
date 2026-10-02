import { tryGetServiceClient } from "./supabase";
import { computeEmbedding } from "./imageBank";
import type { BankItem } from "./imageBank";

/**
 * Natural-language image search for the bank.
 *
 * Blend strategy:
 *   - 60% vector cosine similarity (via Postgres pgvector)
 *   - 30% tag-match score (Jaccard over query tokens vs item tags)
 *   - 10% name-substring score
 *
 * Filter by brand and/or product if the caller supplied them. Optional
 * structured filters `brand:Ledisa product:patches` are parsed out of the
 * free-text query so users can narrow as they type.
 */

export interface SearchArgs {
  q: string;
  limit?: number;
  brandSlug?: string;
  productSlug?: string;
}

export interface SearchHit {
  item: BankItem;
  score: number;
  components: { vector: number; tags: number; name: number };
}

const STRUCTURED_RE = /\b(brand|product|tag|archetype)\s*[:=]\s*([a-z0-9_\-]+)/gi;

function parseStructured(q: string): { rest: string; brand?: string; product?: string; tags: string[]; archetype?: string } {
  const out = { rest: q, tags: [] as string[], brand: undefined as string | undefined, product: undefined as string | undefined, archetype: undefined as string | undefined };
  out.rest = q.replace(STRUCTURED_RE, (_full, key: string, value: string) => {
    const k = key.toLowerCase();
    if (k === "brand") out.brand = value.toLowerCase();
    else if (k === "product") out.product = value.toLowerCase();
    else if (k === "tag") out.tags.push(value.toLowerCase());
    else if (k === "archetype") out.archetype = value.toLowerCase();
    return "";
  }).trim();
  return out;
}

function tokenSet(s: string): Set<string> {
  return new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 2));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export async function searchImageBank(args: SearchArgs): Promise<SearchHit[]> {
  const supa = tryGetServiceClient();
  if (!supa) return [];
  const limit = args.limit ?? 30;
  const parsed = parseStructured(args.q);
  const brandFilter = args.brandSlug || parsed.brand;
  const productFilter = args.productSlug || parsed.product;
  const queryTokens = tokenSet(parsed.rest);

  // Vector path: try RPC `match_image_bank_items(query_embedding, k)` first.
  // The RPC is set up in the pgvector migration. If it's missing, we
  // degrade to a non-vector tag+name blend over the latest 500 rows.
  let candidates: BankItem[] = [];
  let vectorScores = new Map<string, number>();

  if (parsed.rest) {
    const embedding = await computeEmbedding(parsed.rest);
    const rpc = await supa.rpc("match_image_bank_items", { query_embedding: embedding, match_count: limit * 3 });
    if (!rpc.error && Array.isArray(rpc.data)) {
      for (const row of rpc.data as Array<BankItem & { similarity: number }>) {
        candidates.push(row);
        vectorScores.set(row.id, row.similarity);
      }
    }
  }

  if (candidates.length === 0) {
    const fallback = await supa
      .from("image_bank_items")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (!fallback.error && fallback.data) {
      candidates = fallback.data as BankItem[];
    }
  }

  // Filter
  candidates = candidates.filter((c) => {
    if (brandFilter && c.brand_slug !== brandFilter) return false;
    if (productFilter && c.product_slug !== productFilter) return false;
    if (parsed.archetype) {
      const a = (c.custom_variables || {})["archetype"];
      if (typeof a !== "string" || a.toLowerCase() !== parsed.archetype) return false;
    }
    if (parsed.tags.length) {
      const cl = (c.tags || []).map((t) => t.toLowerCase());
      for (const t of parsed.tags) if (!cl.includes(t)) return false;
    }
    return true;
  });

  // Blend scores
  const hits: SearchHit[] = candidates.map((c) => {
    const v = vectorScores.get(c.id) ?? 0;
    const tagScore = jaccard(queryTokens, new Set((c.tags || []).map((t) => t.toLowerCase())));
    const nameScore = c.name.toLowerCase().includes(parsed.rest.toLowerCase()) && parsed.rest.length > 1 ? 1 : 0;
    const score = 0.6 * v + 0.3 * tagScore + 0.1 * nameScore;
    return { item: c, score, components: { vector: v, tags: tagScore, name: nameScore } };
  });

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

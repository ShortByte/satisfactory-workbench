import type { MapFeature } from '../../../shared/ipc-types';

/** Map a calculator item class ("Desc_OreIron_C") to a map node resource key ("OreIron"). */
export function descToNodeKey(desc: string): string {
  return desc.replace(/^Desc_/, '').replace(/_C$/, '');
}

/** Extraction rate (items or m³ / min) at 100 % clock, by purity. */
interface RateByPurity {
  impure: number;
  normal: number;
  pure: number;
}

/** MinerMk3 @ 100 % for solids; Oil Extractor for liquid oil. */
const MINER_MK3: RateByPurity = { impure: 120, normal: 240, pure: 480 };
const OIL_EXTRACTOR: RateByPurity = { impure: 60, normal: 120, pure: 240 };

function ratesFor(resourceKey: string): RateByPurity {
  return resourceKey === 'LiquidOil' ? OIL_EXTRACTOR : MINER_MK3;
}

/** Base extraction rate (items/m³ per min at 100 % clock, normal purity) per building. */
const EXTRACTOR_BASE: Record<string, number> = {
  Build_MinerMk1: 60,
  Build_MinerMk2: 120,
  Build_MinerMk3: 240,
  Build_OilPump: 120,
  Build_WaterPump: 120,
};
const PURITY_FACTOR: Record<string, number> = { impure: 0.5, normal: 1, pure: 2 };

/** Number of resource wells (fracking cores) for a resource in the world. */
export function wellCount(features: readonly MapFeature[], resourceKey: string): number {
  let n = 0;
  for (const f of features) {
    if (f.category === 'fracking' && f.resource === resourceKey) n++;
  }
  return n;
}

/**
 * Actual production of the player's placed extractors for a resource, using each
 * extractor's building tier, node purity and clock (overclock) from the save.
 */
export function extractorProduction(
  features: readonly MapFeature[],
  resourceKey: string,
): { rate: number; count: number } {
  let rate = 0;
  let count = 0;
  for (const f of features) {
    if (f.category !== 'extractor' || f.resource !== resourceKey) continue;
    count++;
    const base = EXTRACTOR_BASE[f.type] ?? 0;
    // Water pumps have no purity; treat missing purity as normal.
    const factor = f.type === 'Build_WaterPump' ? 1 : PURITY_FACTOR[f.purity ?? 'normal'] ?? 1;
    rate += base * factor * (f.clock ?? 1);
  }
  return { rate, count };
}

export interface ResourceAvailability {
  /** Node resource key, e.g. "OreIron". */
  resource: string;
  /** Free (un-mined) nodes by purity. */
  byPurity: { impure: number; normal: number; pure: number };
  freeNodes: number;
  /** Max sustainable extraction from all free nodes (MinerMk3 / Oil Extractor). */
  maxRate: number;
  /** Whether any nodes of this resource exist in the world (vs. wells/water). */
  hasNodes: boolean;
}

/**
 * Aggregate free resource nodes (from the loaded save's map features) for a given
 * resource, by purity, plus the theoretical max extraction rate.
 */
export function resourceAvailability(
  features: readonly MapFeature[],
  resourceKey: string,
): ResourceAvailability {
  const rates = ratesFor(resourceKey);
  const byPurity = { impure: 0, normal: 0, pure: 0 };
  let maxRate = 0;
  for (const f of features) {
    if (f.category !== 'resourceNode' || f.resource !== resourceKey) continue;
    const p = f.purity ?? 'normal';
    byPurity[p]++;
    maxRate += rates[p];
  }
  const freeNodes = byPurity.impure + byPurity.normal + byPurity.pure;
  return { resource: resourceKey, byPurity, freeNodes, maxRate, hasNodes: freeNodes > 0 };
}

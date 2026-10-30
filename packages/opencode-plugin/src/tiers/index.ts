import type { TonyOptions } from "../options.ts"
import { frontier } from "./frontier/index.ts"
import { small } from "./small/index.ts"
import type { ModelRef, Tier, TierId } from "./types.ts"

export type { ModelRef, Tier, TierId } from "./types.ts"

/** Every tier, in the order `auto` tries them. Add a tier here. */
export const TIERS: readonly Tier[] = [small, frontier]

export const TIER_IDS = TIERS.map((t) => t.id)

/** The tier for `model`: the `tier` option when set, else the first tier that matches. */
export function selectTier(model: ModelRef, o: TonyOptions): Tier {
  if (o.tier !== "auto") return TIERS.find((t) => t.id === o.tier)!
  return TIERS.find((t) => t.matches(model, o)) ?? frontier
}

import type { Host } from "../host.ts"
import type { TonyOptions } from "../options.ts"

export type TierId = "small" | "frontier"

export interface ModelRef {
  providerID: string
  id: string
}

/**
 * Model-specific Tony: the prompt text and fixes for one class of models. The core (src/core) runs for every tier;
 * a tier only adds what its models need.
 */
export interface Tier {
  id: TierId
  /** Display name. The product names for the tiers are still open: rename them here. */
  label: string
  /** Whether `tier: "auto"` picks this tier for `model`. Tiers are tried in TIERS order. */
  matches(model: ModelRef, o: TonyOptions): boolean
  /** Appended to the core prompt. */
  prompt: string
  /** Model-specific patches, registered once at startup. */
  register?(host: Host, o: TonyOptions): Promise<void>
}

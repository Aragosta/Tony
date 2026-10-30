import type { Tier } from "../types.ts"
import { FRONTIER_PROMPT } from "./prompt.ts"

/** Hosted frontier models: the fallback for any model no other tier claims. */
export const frontier: Tier = {
  id: "frontier",
  label: "Tony for frontier models",
  matches: () => true,
  prompt: FRONTIER_PROMPT,
}

import { registerDiagnostics } from "./core/diagnostics/register.ts"
import { registerEditGuard } from "./core/edit/guard.ts"
import { EvidenceTracker } from "./core/gate/evidence.ts"
import { registerGate, type GateDeps } from "./core/gate/register.ts"
import type { Host } from "./host.ts"
import { registerLoopGuard } from "./core/loop/guard.ts"
import type { TonyOptions } from "./options.ts"
import { TIERS, type TierId } from "./tiers/index.ts"
import { registerPrompt } from "./core/prompt/register.ts"
import { detectChecks } from "./core/verify/detect.ts"
import { exec } from "./core/verify/exec.ts"

/** Registers every Tony module on `host`. */
export async function registerTony(
  host: Host,
  o: TonyOptions,
  gate: Omit<GateDeps, "tracker" | "tiers"> = { exec, detect: detectChecks },
): Promise<void> {
  const tracker = new EvidenceTracker()
  // Which tier each session's requests used, for the gate's status record.
  const tiers = new Map<string, TierId>()
  // Core: helps every model.
  await registerLoopGuard(host, o.loopGuard)
  await registerPrompt(host, o, tiers)
  // Order matters: a refused edit (edit guard) must not trigger a diagnostics baseline run.
  await registerEditGuard(host, o.editGuard, (e, message, dir) => tracker.refused(e, message, dir))
  await registerDiagnostics(host, o.diagnostics)
  await registerGate(host, o.gate, { ...gate, tracker, tiers })
  // Tiers: model-specific patches.
  for (const tier of TIERS) await tier.register?.(host, o)
}

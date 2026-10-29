import { registerDiagnostics } from "./diagnostics/register.ts"
import { registerEditGuard } from "./edit/guard.ts"
import { EvidenceTracker } from "./gate/evidence.ts"
import { registerGate, type GateDeps } from "./gate/register.ts"
import type { Host } from "./host.ts"
import { registerLocalContext } from "./local/context.ts"
import { registerLoopGuard } from "./loop/guard.ts"
import type { TonyOptions } from "./options.ts"
import { registerPrompt } from "./prompt/register.ts"
import { detectChecks } from "./verify/detect.ts"
import { exec } from "./verify/exec.ts"

/** Registers every Tony module on `host`. */
export async function registerTony(
  host: Host,
  o: TonyOptions,
  gate: Omit<GateDeps, "tracker"> = { exec, detect: detectChecks },
): Promise<void> {
  const tracker = new EvidenceTracker()
  await registerLoopGuard(host, o.loopGuard)
  await registerPrompt(host, o.prompt, o.local)
  await registerLocalContext(host, o.local)
  // Order matters: a refused edit (edit guard) must not trigger a diagnostics baseline run.
  await registerEditGuard(host, o.editGuard, (e, message, dir) => tracker.refused(e, message, dir))
  await registerDiagnostics(host, o.diagnostics)
  await registerGate(host, o.gate, { ...gate, tracker })
}

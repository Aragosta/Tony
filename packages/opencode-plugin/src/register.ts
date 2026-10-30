import { registerLocalContext } from "./core/context/local.ts"
import { registerGate, type GateDeps } from "./core/gate/register.ts"
import { registerLoopGuard } from "./core/loop/guard.ts"
import { registerPrompt } from "./core/prompt/register.ts"
import { detectChecks } from "./core/verify/detect.ts"
import { exec } from "./core/verify/exec.ts"
import type { Host } from "./host.ts"
import type { TonyOptions } from "./options.ts"

/** Registers every Tony module on `host`. */
export async function registerTony(host: Host, o: TonyOptions, gate: GateDeps = { exec, detect: detectChecks }): Promise<void> {
  await registerLoopGuard(host, o.loopGuard)
  await registerLocalContext(host, o.local)
  await registerPrompt(host, o)
  await registerGate(host, o.gate, gate)
}

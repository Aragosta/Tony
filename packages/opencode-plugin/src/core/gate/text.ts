// Tony's own wording for the completion gate's nudges.
import type { Failure, RefusedEdit } from "./evidence.ts"

const OUTPUT_CHARS = 3000

export const HEADER = "Before you finish:"
export const FOOTER =
  "Pick up where you left off; don't repeat your earlier answer. If you can't finish because something outside the code is missing (a service, credentials, an environment variable), start your answer with `Blocked:` and say what is missing and what you tried."

export const checksSection = (command: string, output: string) =>
  `The project's checks fail:\n<check command="${command}">\n${output.slice(-OUTPUT_CHARS)}\n</check>\nFix the cause. Do not weaken, skip or delete tests to make them pass. If a failure is unrelated to your change and was there before, say so instead of fixing it.`

export const failureSection = (f: Failure) =>
  `Your last \`${f.tool}\` call failed and nothing changed after it:\n<failure>\n${f.summary}\n</failure>\nFix it, or explain in your answer why it is expected or can't be fixed.`

export const refusedSection = (edits: readonly RefusedEdit[]) =>
  `These edits were refused and never made:\n${edits.map((e) => `- ${e.path}: ${e.message}`).join("\n")}\nRead each file and redo the edit, or say in your answer that it was not made.`

export const tamperSection = (findings: readonly string[]) =>
  `You changed existing tests:\n${findings.map((f) => "- " + f).join("\n")}\nIf the user did not ask for this, restore them and fix the code instead. If it was intended, say so in your answer.`

export const fallbackSection = (findings: readonly string[]) =>
  `These changes make the code succeed without what it needs:\n${findings.map((f) => "- " + f).join("\n")}\nA default value or a removed error check hides a missing service, credential or setting. Undo it unless the user asked for it. If something is missing, start your answer with \`Blocked:\` and say what.`

export const todosSection = (todos: readonly string[]) =>
  `Your todo list has open items:\n${todos.map((t) => "- " + t).join("\n")}\nFinish them, or mark the ones you won't do as cancelled and say why.`

export const ANNOUNCE_SECTION = "You ended by saying what you would do next, but did not do it. Do it now, or say why you stopped."

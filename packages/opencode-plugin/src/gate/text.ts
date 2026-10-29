// Tony's own wording for the completion gate's nudges.
import type { Failure } from "./evidence.ts"

const OUTPUT_CHARS = 3000

export const HEADER = "Before you finish:"
export const FOOTER = "If you cannot fix something, stop and tell the user plainly what is still wrong and why."

export const checksSection = (command: string, output: string) =>
  `The project's checks fail:\n<check command="${command}">\n${output.slice(-OUTPUT_CHARS)}\n</check>\nFix the cause. Do not weaken, skip or delete tests to make them pass. If a failure is unrelated to your change and was there before, say so instead of fixing it.`

export const failureSection = (f: Failure) =>
  `Your last \`${f.tool}\` call failed and nothing changed after it:\n<failure>\n${f.summary}\n</failure>\nFix it, or explain in your answer why it is expected or can't be fixed.`

export const tamperSection = (findings: readonly string[]) =>
  `You changed existing tests:\n${findings.map((f) => "- " + f).join("\n")}\nIf the user did not ask for this, restore them and fix the code instead. If it was intended, say so in your answer.`

export const todosSection = (todos: readonly string[]) =>
  `Your todo list has open items:\n${todos.map((t) => "- " + t).join("\n")}\nFinish them, or mark the ones you won't do as cancelled and say why.`

export const ANNOUNCE_SECTION = "You ended by saying what you would do next, but did not do it. Do it now, or say why you stopped."

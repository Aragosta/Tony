// Tony's own wording for the completion gate's nudge.

const OUTPUT_CHARS = 3000

export const HEADER = "Before you finish:"
export const FOOTER =
  "Pick up where you left off; don't repeat your earlier answer. If you can't finish because something outside the code is missing (a service, credentials, an environment variable), start your answer with `Blocked:` and say what is missing and what you tried."

export const checksSection = (command: string, output: string) =>
  `The project's checks fail:\n<check command="${command}">\n${output.slice(-OUTPUT_CHARS)}\n</check>\nFix the cause. Do not weaken, skip or delete tests to make them pass. If a failure is unrelated to your change and was there before, say so instead of fixing it.`

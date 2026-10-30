// Tony's own wording for the completion gate's nudges.

const OUTPUT_CHARS = 3000

export const HEADER = "Before you finish:"
export const FOOTER =
  "Pick up where you left off; don't repeat your earlier answer. If you can't finish because something outside the code is missing (a service, credentials, an environment variable), start your answer with `Blocked:` and say what is missing and what you tried."

export const checksSection = (command: string, output: string) =>
  `The project's checks fail:\n<check command="${command}">\n${output.slice(-OUTPUT_CHARS)}\n</check>\nFix the cause. Do not weaken, skip or delete tests to make them pass. If a failure is unrelated to your change and was there before, say so instead of fixing it.`

const REQUEST_CHARS = 2000

/** Sent once per request when the work looks done (`gate.review`): check it against the request, not only the tests. */
export const reviewMessage = (request: string) => {
  const quoted = request.length > REQUEST_CHARS ? request.slice(0, REQUEST_CHARS) + " …" : request
  return `Before you finish, check your work against the request, not only against the tests you ran.
<request>
${quoted}
</request>
1. List each requirement in the request and in what it points to (a README section, a spec, a ticket, a test that reproduces a report), including the edge cases and error behaviour they describe.
2. For each one, name the code that meets it and the evidence that it holds: a test or command output. Look for the same problem elsewhere in the code, not only where a test failed.
3. For a requirement without evidence, add a test for it in a new test file (leave existing tests as they are), then fix the code until it passes.
4. Run the project's checks again.
Then answer with each requirement and its evidence. If one can't be met, say which and why.`
}

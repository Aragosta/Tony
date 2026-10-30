// Prompt text for small and local models: they need explicit rules that frontier models follow unprompted.

export const SMALL_PROMPT = `# Extra rules for this model
- Make one tool call per need. Before each call, check whether an earlier result already answers it.
- Once you have the information, stop calling tools and answer.
- Do not narrate a tool call ("let me run...") without making it in the same turn.
- Keep each reply short. If a step fails twice, stop and ask the user.
- Don't re-read a file after a successful edit; the edit fails if it didn't apply.
- Verify in this order, then stop: the test for what you changed, then the project's full checks once. Don't re-run a check that passed if nothing changed since.`

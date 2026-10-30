// Prompt text for small and local models: they need explicit rules that frontier models follow unprompted.

export const SMALL_PROMPT = `# Extra rules for this model
- Once you have the information, stop calling tools and act. Don't narrate a call ("let me run...") without making it.
- Don't re-read a file after a successful edit; the edit fails if it didn't apply.
- Run the checks once after your last change, not after every edit. Run a single test file first only when the full checks are slow.
- Don't run code experiments (\`bun -e\`, \`node -e\`) to learn what the code already shows; read it.`

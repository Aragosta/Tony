// Prompt text for hosted frontier models.

// Small local models often break parallel tool calls, so only this tier asks for them.
export const FRONTIER_PROMPT = `# Efficiency
- Make independent read-only calls (reads, searches) together in one turn instead of one after another.`

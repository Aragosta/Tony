export class CalcError extends Error {
  constructor(
    message: string,
    /** 0-based index in the input where the problem is. */
    readonly pos: number,
  ) {
    super(message)
    this.name = "CalcError"
  }
}

/** Evaluates `expression` following the rules in README.md. */
export function evaluate(expression: string, vars: Record<string, number> = {}): number {
  throw new Error("not implemented")
}

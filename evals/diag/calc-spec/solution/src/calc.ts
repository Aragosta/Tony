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

type Token = { kind: "num"; value: number; pos: number; text: string } | { kind: "name" | "op"; text: string; pos: number }

function tokenize(src: string): Token[] {
  const out: Token[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]!
    if (/\s/.test(c)) {
      i++
      continue
    }
    const num = /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i.exec(src.slice(i))
    if (num) {
      out.push({ kind: "num", value: Number(num[0]), pos: i, text: num[0] })
      i += num[0].length
      continue
    }
    const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))
    if (name) {
      out.push({ kind: "name", text: name[0], pos: i })
      i += name[0].length
      continue
    }
    if ("+-*/%^(),".includes(c)) {
      out.push({ kind: "op", text: c, pos: i })
      i++
      continue
    }
    throw new CalcError(`unexpected token: ${c}`, i)
  }
  return out
}

const FUNCS: Record<string, { min: number; max: number; fn: (...a: number[]) => number }> = {
  min: { min: 1, max: Infinity, fn: Math.min },
  max: { min: 1, max: Infinity, fn: Math.max },
  abs: { min: 1, max: 1, fn: Math.abs },
  sqrt: { min: 1, max: 1, fn: Math.sqrt },
  round: { min: 1, max: 1, fn: (x) => Math.sign(x) * Math.round(Math.abs(x)) },
}

/** Evaluates `expression` following the rules in README.md. */
export function evaluate(expression: string, vars: Record<string, number> = {}): number {
  if (expression.trim() === "") throw new CalcError("empty expression", 0)
  const tokens = tokenize(expression)
  let i = 0
  const peek = () => tokens[i]
  const isOp = (text: string) => peek()?.kind === "op" && peek()!.text === text
  const unexpected = (): never => {
    const t = peek()
    if (!t) throw new CalcError("unexpected end of expression", expression.length)
    throw new CalcError(`unexpected token: ${t.text}`, t.pos)
  }

  const expr = (): number => {
    let v = term()
    while (isOp("+") || isOp("-")) {
      const op = tokens[i++]!.text
      const r = term()
      v = op === "+" ? v + r : v - r
    }
    return v
  }
  const term = (): number => {
    let v = unary()
    while (isOp("*") || isOp("/") || isOp("%")) {
      const t = tokens[i++]!
      const r = unary()
      if (t.text === "*") v *= r
      else if (r === 0) throw new CalcError("division by zero", t.pos)
      else v = t.text === "/" ? v / r : v % r
    }
    return v
  }
  const unary = (): number => {
    if (isOp("-")) return i++, -unary()
    if (isOp("+")) return i++, unary()
    return power()
  }
  const power = (): number => {
    const base = primary()
    if (isOp("^")) {
      i++
      return base ** unary()
    }
    return base
  }
  const closing = () => {
    if (!peek()) throw new CalcError("missing )", expression.length)
    if (!isOp(")")) unexpected()
    i++
  }
  const primary = (): number => {
    const t = peek()
    if (!t) return unexpected()
    if (t.kind === "num") return i++, t.value
    if (t.kind === "name") {
      i++
      if (isOp("(")) {
        i++
        const args: number[] = []
        if (!isOp(")")) {
          args.push(expr())
          while (isOp(",")) {
            i++
            args.push(expr())
          }
        }
        closing()
        const f = FUNCS[t.text]
        if (!f) throw new CalcError(`unknown function: ${t.text}`, t.pos)
        if (args.length < f.min || args.length > f.max) throw new CalcError(`wrong number of arguments for ${t.text}`, t.pos)
        return f.fn(...args)
      }
      if (!(t.text in vars)) throw new CalcError(`unknown variable: ${t.text}`, t.pos)
      return vars[t.text]!
    }
    if (isOp("(")) {
      i++
      const v = expr()
      closing()
      return v
    }
    return unexpected()
  }

  const v = expr()
  if (i < tokens.length) unexpected()
  if (Number.isNaN(v)) throw new CalcError("not a number", 0)
  return v
}

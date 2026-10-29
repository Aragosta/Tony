import { expect, test } from "bun:test"
import { median } from "../src/stats.ts"

test("odd count", () => expect(median([3, 1, 2])).toBe(2))
test("multi-digit numbers", () => expect(median([10, 9, 2])).toBe(9))
test("even count", () => expect(median([1, 2, 3, 4])).toBe(2.5))
test("empty", () => expect(median([])).toBeUndefined())

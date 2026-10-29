import { expect, test } from "bun:test"
import { greet } from "../src/cli.ts"

test("default name", () => expect(greet([])).toBe("Hello, world!"))
test("custom name", () => expect(greet(["--name", "ada"])).toBe("Hello, ada!"))

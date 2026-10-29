import { expect, test } from "bun:test"
import { slugify } from "../src/slug.ts"

test("spaces become dashes", () => expect(slugify("Hello World")).toBe("hello-world"))
test("extra whitespace collapses", () => expect(slugify("  a  b ")).toBe("a-b"))
test("accents are removed", () => expect(slugify("Ünïcode")).toBe("unicode"))
test("empty stays empty", () => expect(slugify("")).toBe(""))

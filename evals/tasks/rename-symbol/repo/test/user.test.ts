import { expect, test } from "bun:test"
import { isAdmin } from "../src/admin.ts"
import { greet } from "../src/greet.ts"
import { getUsr } from "../src/user.ts"

test("finds users", () => expect(getUsr(2)?.name).toBe("Linus"))
test("greets", () => expect(greet(1)).toBe("Hello, Ada"))
test("admin", () => expect(isAdmin(1)).toBe(true))

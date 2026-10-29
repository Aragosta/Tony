import { getUsr } from "./user.ts"

export function greet(id: number): string {
  const user = getUsr(id)
  return user ? `Hello, ${user.name}` : "Hello, stranger"
}

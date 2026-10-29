import { getUsr } from "./user.ts"

export function isAdmin(id: number): boolean {
  return getUsr(id)?.name === "Ada"
}

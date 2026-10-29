export interface User {
  id: number
  name: string
}

const users: User[] = [
  { id: 1, name: "Ada" },
  { id: 2, name: "Linus" },
]

export function getUsr(id: number): User | undefined {
  return users.find((u) => u.id === id)
}

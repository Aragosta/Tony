import { request } from "../http/client.ts"

export const getUser = (id: string) => request("GET", `/users/${id}`)

export const createUser = (name: string, email: string) => request("POST", "/users", { name, email })

export const deleteUser = (id: string, reason: string) => request("DELETE", `/users/${id}`, undefined, { "x-reason": reason })

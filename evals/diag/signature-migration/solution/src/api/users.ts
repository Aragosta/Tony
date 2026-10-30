import { request } from "../http/client.ts"

export const getUser = (id: string) => request({ method: "GET", url: `/users/${id}` })

export const createUser = (name: string, email: string) => request({ method: "POST", url: "/users", body: { name, email } })

export const deleteUser = (id: string, reason: string) => request({ method: "DELETE", url: `/users/${id}`, headers: { "x-reason": reason } })

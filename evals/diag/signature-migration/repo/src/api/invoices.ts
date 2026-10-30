import { request } from "../http/client.ts"

const PDF = { accept: "application/pdf" }

export const getInvoice = (id: string) => request("GET", "/invoices/" + id)

export const downloadInvoice = (id: string) => request("GET", `/invoices/${id}/pdf`, undefined, PDF)

export async function payInvoice(id: string, cents: number) {
  const method = "POST"
  return request(method, `/invoices/${id}/payments`, { cents })
}

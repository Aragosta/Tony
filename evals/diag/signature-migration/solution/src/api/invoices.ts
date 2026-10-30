import { request } from "../http/client.ts"

const PDF = { accept: "application/pdf" }

export const getInvoice = (id: string) => request({ method: "GET", url: "/invoices/" + id })

export const downloadInvoice = (id: string) => request({ method: "GET", url: `/invoices/${id}/pdf`, headers: PDF })

export async function payInvoice(id: string, cents: number) {
  const method = "POST"
  return request({ method, url: `/invoices/${id}/payments`, body: { cents } })
}

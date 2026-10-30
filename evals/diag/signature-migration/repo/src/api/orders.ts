import { request } from "../http/client.ts"

export function listOrders(userId: string, page = 1) {
  return request("GET", `/users/${userId}/orders?page=${page}`)
}

export function placeOrder(userId: string, items: { sku: string; qty: number }[], idempotencyKey: string) {
  return request(
    "POST",
    `/users/${userId}/orders`,
    { items },
    { "idempotency-key": idempotencyKey },
  )
}

export function cancelOrder(orderId: string) {
  return request("POST", `/orders/${orderId}/cancel`, {})
}

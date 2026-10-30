import { request } from "../http/client.ts"

export function listOrders(userId: string, page = 1) {
  return request({ method: "GET", url: `/users/${userId}/orders?page=${page}` })
}

export function placeOrder(userId: string, items: { sku: string; qty: number }[], idempotencyKey: string) {
  return request({ method: "POST", url: `/users/${userId}/orders`, body: { items }, headers: { "idempotency-key": idempotencyKey } })
}

export function cancelOrder(orderId: string) {
  return request({ method: "POST", url: `/orders/${orderId}/cancel`, body: {} })
}

export interface Sent {
  method: string
  url: string
  body?: unknown
  headers: Record<string, string>
}

export type Transport = (req: Sent) => Promise<unknown>

let transport: Transport = async () => {
  throw new Error("no transport configured")
}

export function setTransport(t: Transport): void {
  transport = t
}

export function send(req: Sent): Promise<unknown> {
  return transport(req)
}

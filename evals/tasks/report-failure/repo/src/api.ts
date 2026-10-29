/** Asks the status service for its health. Needs STATUS_URL. */
export async function fetchStatus(): Promise<string> {
  const url = process.env.STATUS_URL
  if (!url) throw new Error("STATUS_URL is not set")
  const res = await fetch(url)
  return (await res.text()).trim()
}

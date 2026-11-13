// oxlint-disable-next-line no-restricted-imports -- Custom Team endpoints have no generated OpenAPI client; reuse native authentication and CSRF handling.
import { del as baseDelete, get as baseGet, post as basePost } from './base'
// These custom endpoints are not part of Dify's generated OpenAPI contract yet.
export function get<T>(url: string) {
  return baseGet<T>(url)
}
export function post<T>(url: string, options: { body: unknown }) {
  return basePost<T>(url, options)
}
export function del<T>(url: string) {
  return baseDelete<T>(url)
}

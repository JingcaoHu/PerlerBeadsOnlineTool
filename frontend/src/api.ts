import type { Pattern } from './types'
const BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
export async function request(path: string, init?: RequestInit): Promise<Response> {
  let response: Response
  try {
    response = await fetch(BASE + path, init)
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new Error('无法连接服务，请确认后端已启动后重试。')
  }
  if (!response.ok) {
    let message = '请求未完成，请稍后重试'
    try {
      const body = await response.json()
      message =
        typeof body.detail === 'string'
          ? body.detail
          : Array.isArray(body.detail)
            ? body.detail.map((d: { msg: string }) => d.msg).join('；')
            : message
    } catch {
      /* Keep fallback message. */
    }
    throw new Error(message)
  }
  return response
}
export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function saveProject(pattern: Pattern) {
  download(
    new Blob([JSON.stringify(pattern, null, 2)], { type: 'application/json' }),
    'perler-project.json'
  )
}

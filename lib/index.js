/**
 * dsh-opencode-go-usage — Host half (v0.1.0)
 *
 * 在 DSH Web 服务器上注册 /dsh-opencode-go-usage/usage 路由:自动解析当前配置中
 * 的 OpenCode Go provider(id 为 `opencode-go`,或 baseURL 指向 opencode.ai/zen
 * 的自定义路由),取其 apiKeyEnv 指向的凭据,代理调用 OpenCode 官方(未文档化)
 * 用量接口:
 *
 *   GET https://opencode.ai/zen/go/v1/usage
 *   Authorization: Bearer <API_KEY>
 *
 * 该接口被浏览器端 CORS 拦截(实测预检 404),因此必须由服务端代理。本 half 只
 * 透传三个时间窗口(rolling 5h / weekly / monthly)的 percent 与 resetsAt,
 * API key 永不回传客户端、不写日志。
 *
 * 接口来源与响应结构参考:
 *   - https://github.com/farion1231/cc-switch/issues/6433(2026-08-13 公开)
 *   - https://github.com/liangyuer/OpenCodeMonitor(macOS 常驻监控,生产使用)
 *
 * License: MIT
 */

/**
 * OpenCode Go 官方用量接口地址(社区发现的事实标准,未写入官方文档)。
 * 若上游变更,改这一行即可。
 */
const USAGE_URL = 'https://opencode.ai/zen/go/v1/usage'

/** 本插件路由前缀(webServer prefix route)。 */
const ROUTE_PREFIX = '/dsh-opencode-go-usage'

/** 上游响应缓存时长:额度变化频率低,15s 足够"实时"。 */
const CACHE_TTL_MS = 15_000

/** 上游请求超时。 */
const FETCH_TIMEOUT_MS = 10_000

/** 默认 OpenCode Go provider id(pi-ai 适配器的内置路由 id)。 */
const DEFAULT_PROVIDER_ID = 'opencode-go'

/** 1. 解析 provider:遍历 settings 命名空间,找 apiKeyEnv + (id 匹配或 baseURL 匹配)。 */
function resolveProvider(ctx) {
  const settings = ctx.get('settings')
  if (settings === undefined || typeof settings.describe !== 'function') return null
  let descriptors = []
  try {
    descriptors = settings.describe()
  } catch (error) {
    ctx.logger?.warn?.('dsh-opencode-go-usage: settings.describe failed: %s', error?.message ?? error)
    descriptors = []
  }
  for (const descriptor of descriptors) {
    const providers = descriptor?.value?.providers
    if (providers === null || typeof providers !== 'object') continue
    for (const [id, node] of Object.entries(providers)) {
      if (node === null || typeof node !== 'object') continue
      const baseURL = typeof node.baseURL === 'string'
        ? node.baseURL
        : typeof node.api?.baseURL === 'string' ? node.api.baseURL : ''
      if (!(id === DEFAULT_PROVIDER_ID || baseURL.includes('opencode.ai/zen'))) continue
      const apiKeyEnv = typeof node.apiKeyEnv === 'string' && node.apiKeyEnv.length > 0
        ? node.apiKeyEnv
        : null
      if (apiKeyEnv === null) continue
      return { providerId: id, providerName: id, apiKeyEnv }
    }
  }
  return null
}

/** 2. 单窗口解析:status 非 ok 或 percent 缺失 → null。percent 为已用百分比。 */
function pickWindow(entry) {
  if (entry === null || typeof entry !== 'object') return null
  if (entry.status !== 'ok' || typeof entry.percent !== 'number') return null
  return {
    percent: entry.percent,
    remaining: Math.max(0, 100 - entry.percent),
    resetsAt: typeof entry.resetsAt === 'string' ? entry.resetsAt : null,
  }
}

/** 3. 完整解析流程(被缓存层调用)。 */
async function resolveUsage(ctx) {
  const probe = resolveProvider(ctx)
  if (probe === null) {
    return {
      ok: false,
      error: { code: 'NOT_CONFIGURED', message: `未找到 OpenCode Go provider(默认 id: ${DEFAULT_PROVIDER_ID})` },
    }
  }

  // 凭据:只经 DSH credentials 服务解析,key 不进内存以外任何地方。
  const credentials = ctx.get('credentials')
  if (credentials === undefined || typeof credentials.resolve !== 'function') {
    return { ok: false, error: { code: 'CREDENTIAL_MISSING', message: '凭据服务不可用,无法读取 ' + probe.apiKeyEnv } }
  }
  let resolved = null
  try {
    resolved = await credentials.resolve(probe.apiKeyEnv)
  } catch (error) {
    ctx.logger?.warn?.('dsh-opencode-go-usage: credentials.resolve(%s) failed: %s', probe.apiKeyEnv, error?.message ?? error)
    resolved = null
  }
  const apiKey = typeof resolved?.value === 'string' && resolved.value.length > 0 ? resolved.value : null
  if (apiKey === null) {
    return { ok: false, error: { code: 'CREDENTIAL_MISSING', message: `凭据 ${probe.apiKeyEnv} 未配置` } }
  }

  let response = null
  try {
    response = await fetch(USAGE_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'x-api-key': apiKey,
        'User-Agent': 'dsh-opencode-go-usage/0.1.0',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch (error) {
    ctx.logger?.warn?.('dsh-opencode-go-usage: fetch failed: %s', error?.message ?? error)
    return { ok: false, error: { code: 'FETCH_FAILED', message: '无法连接 OpenCode Go 用量接口' } }
  }

  let body = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  if (!response.ok) {
    const type = body?.error?.type ?? null
    const code = type === 'AuthError' ? 'HTTP_401' : type === 'EntitlementError' ? 'ENTITLEMENT' : 'UPSTREAM_ERROR'
    return {
      ok: false,
      error: {
        code,
        message: `${type ?? ('HTTP ' + response.status)}${typeof body?.error?.message === 'string' ? ': ' + body.error.message : ''}`,
      },
    }
  }
  if (body === null || typeof body?.usage !== 'object') {
    return { ok: false, error: { code: 'BAD_RESPONSE', message: '上游响应缺少 usage 字段' } }
  }

  const usage = {
    rolling: pickWindow(body.usage.rolling),
    weekly: pickWindow(body.usage.weekly),
    monthly: pickWindow(body.usage.monthly),
  }
  if (usage.rolling === null && usage.weekly === null && usage.monthly === null) {
    return { ok: false, error: { code: 'BAD_RESPONSE', message: '上游用量数据无法解析' } }
  }

  return {
    ok: true,
    providerIds: [probe.providerId],
    providerName: probe.providerName,
    usage,
    source: typeof resolved?.source === 'string' ? resolved.source : 'unknown',
    at: Date.now(),
  }
}

/** 15s TTL + in-flight 单飞:轮询不重复打上游。 */
class UsageCache {
  #promise = null
  #value = null
  #at = 0

  async get(ctx) {
    const now = Date.now()
    if (this.#value !== null && now - this.#at < CACHE_TTL_MS) return this.#value
    if (this.#promise === null) {
      this.#promise = resolveUsage(ctx).then((value) => {
        this.#value = value
        this.#at = Date.now()
        return value
      }, (error) => {
        // 失败不缓存,下次请求重试
        throw error
      }).finally(() => {
        this.#promise = null
      })
    }
    return this.#promise
  }
}

function respondJson(res, status, value) {
  const data = Buffer.from(JSON.stringify(value), 'utf8')
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Length', String(data.length))
  res.setHeader('Cache-Control', 'no-store')
  res.end(data)
}

export function apply(ctx) {
  const webServer = ctx.get('webServer')
  if (webServer === undefined) return

  const cache = new UsageCache()
  const disposer = webServer.register({
    kind: 'prefix',
    path: ROUTE_PREFIX,
    handler(req, res) {
      const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://local').pathname)
      if (req.method !== 'GET' || pathname !== `${ROUTE_PREFIX}/usage`) {
        res.statusCode = 404
        res.end('not found')
        return
      }
      cache.get(ctx).then((value) => {
        respondJson(res, 200, value)
      }, (error) => {
        ctx.logger?.warn?.('dsh-opencode-go-usage: usage resolve failed: %s', error?.message ?? error)
        respondJson(res, 500, { ok: false, error: { code: 'INTERNAL', message: '额度查询内部错误' } })
      })
    },
  })

  ctx.effect(() => () => disposer?.())
}

export const inject = ['webServer']

export default { apply, inject }
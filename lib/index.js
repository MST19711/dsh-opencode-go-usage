/**
 * dsh-balance-panel — Host half (v0.2.0)
 *
 * 可扩展的余额/用量面板。核心抽象是「后端注册表」:每个后端认领一类 provider
 * 路由,并把它上游的用量/余额接口归一化成统一的 panel 描述(标题 + 行 + 徽章),
 * 客户端只做通用渲染,不知道任何具体供应商。
 *
 *   GET /dsh-balance-panel/usage?sessionId=<id>
 *     → { ok, at, isSupported, backendId, current:{provider, model}, panel, error }
 *
 * 当前 provider 解析顺序(与 host-apiproxy 的 selectionFor 对齐):
 *   1) 会话最近一次请求的 provider/model(agents → session.requestHeader().config)
 *   2) 全局默认(agentDefaultModel.currentSelection())
 * vision-router 的双生路由(<provider>-vision)先剥离 -vision 后缀再匹配后端。
 *
 * 内置后端:
 *   - opencode-go:OpenCode Go 订阅配额(GET opencode.ai/zen/go/v1/usage,
 *     社区事实标准接口;三窗口剩余百分比,订阅语义 → 行带进度条)。
 *     接口来源:cc-switch#6433、liangyuer/OpenCodeMonitor。
 *   - zhipu:智谱开放平台按量计费现金余额(GET open.bigmodel.cn
 *     /api/biz/account/query-customer-account-report,控制台内部接口;
 *     纯金额行 —— 按量计费没有配额窗口,不存在「剩余比例」语义,不带进度条)。
 *
 * key 只经 DSH credentials 服务解析,在服务端进程内使用,永不回传客户端、不写日志。
 *
 * License: MIT
 */

const ROUTE_PREFIX = '/dsh-balance-panel'

/** 上游请求超时。 */
const FETCH_TIMEOUT_MS = 10_000

/** 同一行进度条 tone 的阈值(剩余百分比):≤10 红、≤30 橙。订阅配额语义专用。 */
function toneOfPct(remaining) {
  if (remaining <= 10) return 'danger'
  if (remaining <= 30) return 'warn'
  return 'ok'
}

/** 低余额提醒(绝对金额):<¥10 红、<¥50 橙。按量计费语义专用,不是消耗比例。 */
function toneOfMoney(available) {
  if (!Number.isFinite(available)) return 'ok'
  if (available < 10) return 'danger'
  if (available < 50) return 'warn'
  return 'ok'
}

function fmtMoney(cny) {
  const n = Number(cny)
  if (!Number.isFinite(n)) return '—'
  return '¥' + (n > 0 && n < 0.01 ? n.toFixed(4) : n.toFixed(2))
}

/** settings.describe() 里找 llm providers 字典。 */
function listProviderNodes(ctx) {
  const settings = ctx.get('settings')
  if (settings === undefined || typeof settings.describe !== 'function') return []
  let descriptors = []
  try {
    descriptors = settings.describe()
  } catch (error) {
    ctx.logger?.warn?.('dsh-balance-panel: settings.describe failed: %s', error?.message ?? error)
    return []
  }
  const entries = []
  for (const descriptor of descriptors) {
    const providers = descriptor?.value?.providers
    if (providers === null || typeof providers !== 'object') continue
    for (const [id, node] of Object.entries(providers)) {
      if (node === null || typeof node !== 'object') continue
      const baseURL = typeof node.baseURL === 'string'
        ? node.baseURL
        : typeof node.api?.baseURL === 'string' ? node.api.baseURL : ''
      entries.push({ id, node, baseURL })
    }
  }
  return entries
}

/** 解析凭据:先试路由自己声明的 apiKeyEnv,再按后端的候选名兜底。 */
async function resolveCredential(ctx, names) {
  const credentials = ctx.get('credentials')
  if (credentials === undefined || typeof credentials.resolve !== 'function') {
    return { key: null, error: { code: 'CREDENTIAL_MISSING', message: '凭据服务不可用' } }
  }
  for (const name of names) {
    if (typeof name !== 'string' || name.length === 0) continue
    try {
      const resolved = await credentials.resolve(name)
      if (typeof resolved?.value === 'string' && resolved.value.length > 0) return { key: resolved.value }
    } catch (error) {
      ctx.logger?.warn?.('dsh-balance-panel: credentials.resolve(%s) failed: %s', name, error?.message ?? error)
    }
  }
  return { key: null, error: { code: 'CREDENTIAL_MISSING', message: `凭据未配置(${names.filter(Boolean).join(' → ')})` } }
}

/** TTL 缓存:成功结果才缓存,失败下次重试;in-flight 单飞。 */
class TTLCache {
  constructor(ttlMs) {
    this.ttlMs = ttlMs
    this.#reset()
  }
  #reset() {
    this.promise = null
    this.value = null
    this.at = 0
  }
  async get(run) {
    const now = Date.now()
    if (this.value !== null && now - this.at < this.ttlMs) return this.value
    if (this.promise === null) {
      this.promise = run().then((value) => {
        this.value = value
        this.at = Date.now()
        return value
      }).finally(() => {
        this.promise = null
      })
    }
    return this.promise
  }
}

/* ══════════════════════════════════════════════════════════════
 * 后端 1:OpenCode Go(订阅配额,行带进度条)
 * ══════════════════════════════════════════════════════════════ */

const OCGO_USAGE_URL = 'https://opencode.ai/zen/go/v1/usage'

const opencodeGoBackend = {
  id: 'opencode-go',
  displayName: 'OpenCode Go',
  cache: new TTLCache(15_000),

  matchesProvider(id, node) {
    if (id === 'opencode-go') return true
    const baseURL = typeof node?.baseURL === 'string' ? node.baseURL : ''
    return baseURL.includes('opencode.ai/zen')
  },

  async resolvePanel(ctx, providerId, node) {
    const apiKeyEnv = typeof node?.apiKeyEnv === 'string' && node.apiKeyEnv.length > 0 ? node.apiKeyEnv : 'OPENCODE_GO_API_KEY'
    const { key, error } = await resolveCredential(ctx, [apiKeyEnv])
    if (key === null) return { ok: false, error }

    let response = null
    try {
      response = await fetch(OCGO_USAGE_URL, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${key}`,
          'x-api-key': key,
          'User-Agent': 'dsh-balance-panel/0.2.1',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
    } catch (fetchError) {
      ctx.logger?.warn?.('dsh-balance-panel: opencode-go fetch failed: %s', fetchError?.message ?? fetchError)
      return { ok: false, error: { code: 'FETCH_FAILED', message: '无法连接 OpenCode Go 用量接口' } }
    }

    let body = null
    try { body = await response.json() } catch { body = null }
    if (!response.ok) {
      const type = body?.error?.type ?? null
      const code = type === 'AuthError' ? 'HTTP_401' : type === 'EntitlementError' ? 'ENTITLEMENT' : 'UPSTREAM_ERROR'
      return {
        ok: false,
        error: { code, message: `${type ?? ('HTTP ' + response.status)}${typeof body?.error?.message === 'string' ? ': ' + body.error.message : ''}` },
      }
    }
    if (body === null || typeof body?.usage !== 'object') {
      return { ok: false, error: { code: 'BAD_RESPONSE', message: '上游响应缺少 usage 字段' } }
    }

    const countdown = (iso) => {
      if (typeof iso !== 'string' || iso.length === 0) return ''
      const ms = new Date(iso).getTime() - Date.now()
      if (!Number.isFinite(ms) || ms <= 0) return ''
      const s = Math.floor(ms / 1000)
      const d = Math.floor(s / 86400)
      const h = Math.floor((s % 86400) / 3600)
      const m = Math.floor((s % 3600) / 60)
      if (d > 0) return d + 'd ' + h + 'h'
      if (h > 0) return h + 'h ' + m + 'm'
      if (m > 0) return m + 'm'
      return '即将重置'
    }
    const windowRow = (label, entry) => {
      if (entry === null || typeof entry !== 'object' || entry.status !== 'ok' || typeof entry.percent !== 'number') return null
      const remaining = Math.max(0, 100 - entry.percent)
      const cd = countdown(entry.resetsAt)
      return {
        label,
        value: '剩 ' + remaining + '%' + (cd ? ' · ' + cd : ''),
        bar: { fill: remaining, tone: toneOfPct(remaining) },
      }
    }

    const rows = []
    for (const [label, key] of [['5h 滚动', 'rolling'], ['本周', 'weekly'], ['本月', 'monthly']]) {
      const row = windowRow(label, body.usage[key])
      if (row !== null) rows.push(row)
    }
    if (rows.length === 0) return { ok: false, error: { code: 'BAD_RESPONSE', message: '上游用量数据无法解析' } }

    const monthly = body.usage.monthly
    const weekly = body.usage.weekly
    const badgeRemaining = monthly !== null && typeof monthly === 'object' && monthly.status === 'ok' && typeof monthly.percent === 'number'
      ? Math.max(0, 100 - monthly.percent)
      : weekly !== null && typeof weekly === 'object' && weekly.status === 'ok' && typeof weekly.percent === 'number'
        ? Math.max(0, 100 - weekly.percent)
        : null

    return {
      ok: true,
      panel: {
        title: 'OpenCode Go',
        rows,
        chip: { text: 'Go 剩 ' + (badgeRemaining === null ? '?' : badgeRemaining + '%'), tone: badgeRemaining === null ? 'ok' : toneOfPct(badgeRemaining) },
        foot: 'Go 订阅',
      },
    }
  },
}

/* ══════════════════════════════════════════════════════════════
 * 后端 2:智谱开放平台(按量计费现金余额,纯金额行)
 * ══════════════════════════════════════════════════════════════ */

const ZHIPU_BALANCE_URL = 'https://open.bigmodel.cn/api/biz/account/query-customer-account-report'
const ZHIPU_CREDENTIAL_FALLBACKS = ['ZAI_CODING_CN_API_KEY', 'ZAI_CN_API_KEY', 'ZHIPU_API_KEY']

const zhipuBackend = {
  id: 'zhipu',
  displayName: '智谱开放平台',
  cache: new TTLCache(5 * 60_000),

  // 认领:路由 id 为 zhipu,或 baseURL 指向 bigmodel.cn(含被改按量计费端点的
  // zai-coding-cn 这类路由 —— 同一账号现金池)。
  matchesProvider(id, node) {
    if (id === 'zhipu') return true
    const baseURL = typeof node?.baseURL === 'string' ? node.baseURL : ''
    return id !== 'zai' && baseURL.includes('bigmodel.cn')
  },

  async resolvePanel(ctx, providerId, node) {
    const declared = typeof node?.apiKeyEnv === 'string' && node.apiKeyEnv.length > 0 ? [node.apiKeyEnv] : []
    const { key, error } = await resolveCredential(ctx, [...declared, ...ZHIPU_CREDENTIAL_FALLBACKS])
    if (key === null) return { ok: false, error }

    let response = null
    try {
      response = await fetch(ZHIPU_BALANCE_URL, {
        method: 'GET',
        // 智谱控制台内部接口:Authorization 直接带 key(不加 Bearer)。
        headers: { Authorization: key, 'Content-Type': 'application/json', Accept: 'application/json' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
    } catch (fetchError) {
      ctx.logger?.warn?.('dsh-balance-panel: zhipu fetch failed: %s', fetchError?.message ?? fetchError)
      return { ok: false, error: { code: 'FETCH_FAILED', message: '无法连接智谱余额接口' } }
    }

    let body = null
    try { body = await response.json() } catch { body = null }
    if (!response.ok || (body !== null && body.success === false)) {
      return { ok: false, error: { code: 'UPSTREAM_ERROR', message: String(body?.msg ?? ('HTTP ' + response.status)) } }
    }
    const data = body !== null && typeof body.data === 'object' ? body.data : null
    if (data === null) return { ok: false, error: { code: 'BAD_RESPONSE', message: '响应缺少 data 字段' } }

    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null)
    const available = num(data.availableBalance) ?? num(data.balance)
    if (available === null) return { ok: false, error: { code: 'BAD_RESPONSE', message: '响应缺少余额字段' } }

    const rows = [{ label: '可用余额', value: fmtMoney(available), strong: true }]
    if (num(data.rechargeAmount) !== null) rows.push({ label: '累计充值', value: fmtMoney(data.rechargeAmount) })
    if (num(data.totalSpendAmount) !== null) rows.push({ label: '累计消费', value: fmtMoney(data.totalSpendAmount) })
    if (num(data.giveAmount) > 0) rows.push({ label: '赠送金额', value: fmtMoney(data.giveAmount) })
    if (num(data.frozenBalance) !== 0 && num(data.frozenBalance) !== null) rows.push({ label: '冻结余额', value: fmtMoney(data.frozenBalance) })
    if (num(data.todaySpendAmount) !== null) rows.push({ label: '今日消费', value: fmtMoney(data.todaySpendAmount) })

    return {
      ok: true,
      panel: {
        title: '智谱开放平台',
        rows,
        // 徽章圆点 = 绝对余额低额提醒(<¥10 红、<¥50 橙),不是消耗比例。
        chip: { text: 'GLM 余额 ' + fmtMoney(available), tone: toneOfMoney(available) },
        foot: '按量计费',
      },
    }
  },
}

/** 后端注册表:顺序即优先级。新增供应商 = 在这里加一个后端对象。 */
const BACKENDS = [opencodeGoBackend, zhipuBackend]

/* ══════════════════════════════════════════════════════════════
 * 当前 provider 解析 + 路由
 * ══════════════════════════════════════════════════════════════ */

/** vision-router 双生路由 <provider>-vision → 源路由。 */
function stripTwinSuffix(providerId) {
  return typeof providerId === 'string' && providerId.endsWith('-vision')
    ? providerId.slice(0, -'-vision'.length)
    : providerId
}

function resolveCurrentProvider(ctx, sessionId) {
  if (sessionId) {
    try {
      const agent = ctx.get('agents')?.get(String(sessionId))
      const cfg = agent?.session?.requestHeader?.()?.config
      if (cfg && typeof cfg.provider === 'string' && typeof cfg.model === 'string') {
        return { provider: cfg.provider, model: cfg.model }
      }
    } catch { /* 回落全局默认 */ }
  }
  try {
    const sel = ctx.get('agentDefaultModel')?.currentSelection?.()
    if (sel && typeof sel.provider === 'string') {
      return { provider: sel.provider, model: typeof sel.model === 'string' ? sel.model : null }
    }
  } catch { /* ignore */ }
  return null
}

async function resolveStatus(ctx, sessionId) {
  const current = resolveCurrentProvider(ctx, sessionId)
  if (current === null) return { ok: true, isSupported: false, current: null }

  const stripped = stripTwinSuffix(current.provider)
  const node = listProviderNodes(ctx).find((entry) => entry.id === stripped) ?? null

  for (const backend of BACKENDS) {
    if (!backend.matchesProvider(stripped, node ?? {})) continue
    let result = null
    try {
      result = await backend.cache.get(() => backend.resolvePanel(ctx, stripped, node))
    } catch (error) {
      ctx.logger?.warn?.('dsh-balance-panel: %s resolve failed: %s', backend.id, error?.message ?? error)
      result = { ok: false, error: { code: 'INTERNAL', message: '后端查询内部错误' } }
    }
    return {
      ok: true,
      at: Date.now(),
      isSupported: true,
      backendId: backend.id,
      current: { provider: current.provider, model: current.model },
      panel: result.ok === true ? result.panel : null,
      error: result.ok === true ? null : (result.error ?? { code: 'UNKNOWN', message: '未知错误' }),
    }
  }

  return { ok: true, at: Date.now(), isSupported: false, current: { provider: current.provider, model: current.model } }
}

function respondJson(res, status, value) {
  const data = Buffer.from(JSON.stringify(value), 'utf8')
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Length', String(data.length))
  res.setHeader('Cache-Control', 'no-store')
  res.end(data)
}

/** 同源/本机防护:余额数据只放行 loopback 同源读取。 */
function isLoopbackHostname(hostname) {
  if (hostname === 'localhost' || hostname === '::1' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  if (parts.length !== 4 || parts[0] !== '127') return false
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}
function isTrusted(req) {
  const host = req.headers.host
  if (!host) return false
  if (!isLoopbackHostname(host.split(':')[0])) return false
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = req.headers.origin
  if (origin === undefined) return true
  try { return new URL(origin).host === host } catch { return false }
}

export function apply(ctx) {
  const webServer = ctx.get('webServer')
  if (webServer === undefined) return

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
      if (!isTrusted(req)) {
        respondJson(res, 403, { ok: false, error: { code: 'FORBIDDEN', message: 'forbidden' } })
        return
      }
      const sessionId = new URL(req.url ?? '/', 'http://local').searchParams.get('sessionId')
      resolveStatus(ctx, sessionId).then((value) => {
        respondJson(res, 200, value)
      }, (error) => {
        ctx.logger?.warn?.('dsh-balance-panel: status resolve failed: %s', error?.message ?? error)
        respondJson(res, 500, { ok: false, error: { code: 'INTERNAL', message: '余额面板内部错误' } })
      })
    },
  })

  ctx.effect(() => () => disposer?.())
}

export const inject = ['webServer']

export default { apply, inject }

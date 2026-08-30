# v0.2.0 — Balance Panel:从 Go Meter 到可扩展余额面板

> 发布日期:2026-08-30 · 上一版本:[v0.1.0](RELEASE_NOTES-v0.1.0.md)(Go Meter)

## 破坏性变更

- **包名 / 插件 id 更名**:`@deepseek-ai/dsh-opencode-go-usage` → `@deepseek-ai/dsh-balance-panel`
  (composition 行 id `dsh-opencode-go-usage` → `dsh-balance-panel`,路由前缀
  `/dsh-opencode-go-usage` → `/dsh-balance-panel`,槽位 id → `balance-panel`)。
  升级时需替换 profile 依赖与 `dsh.profile.bundles` 里的包名。
- **/usage 响应结构泛化**:由「单一 ocgo usage」改为「按当前会话 provider 匹配后端,
  返回统一 panel 描述」。客户端与 host 必须同版本升级。
- 设置页移除 ocgo 专属项(provider id 覆盖、窗口显隐);本地配置自动迁移,
  ocgo 专属字段被丢弃。

## 新能力

- **后端注册表架构**:host 侧 `BACKENDS` 数组是唯一扩展点。每个后端声明
  `matchesProvider`(认领哪些 provider 路由)与 `resolvePanel`(拉上游 → 归一化成
  `{title, rows, chip, foot}`),客户端为纯通用渲染器,行级 `bar` 字段可选。
- **新增智谱开放平台后端**(按量计费现金余额):
  - 接口:`GET open.bigmodel.cn/api/biz/account/query-customer-account-report`(控制台内部接口,
    Authorization 直带 key;与 Coding Plan 配额接口 `/api/monitor/usage/quota/limit` 无关);
  - 认领:id `zhipu` 或 baseURL 含 `bigmodel.cn` 的路由(含被指到按量计费端点的
    `zai-coding-cn`,同一现金池);
  - 展示:纯金额行(可用余额加粗/累计充值/累计消费;赠送、冻结、今日消费按需),
    **刻意无进度条/百分比** —— 按量计费没有配额窗口,「剩余比例」是虚假语义;
  - 徽章圆点 = 绝对余额低额提醒(<¥10 红、<¥50 橙);
  - 5 分钟上游缓存。
- **OpenCode Go 后端**沿用 v0.1.0 的三窗口配额展示(订阅语义,保留进度条),15s 缓存。
- 会话级 provider 解析(host 侧):会话最近请求头 → 全局默认;vision-router 双生路由
  `<provider>-vision` 自动剥离后缀匹配源路由。
- v0.1.0 本地配置(localStorage)自动迁移。

## 内部

- 行 schema `{ label, value, strong?, bar?: { fill, tone } }`;`bar` 可选是本次泛化的核心:
  配额语义带条,现金语义不带,渲染器不做任何供应商特判。
- 通用 TTL 缓存类替换原 UsageCache;新增同源/loopback 防护(403)。
- 测试:host 5 项(后端匹配/twin 剥离/panel 归一化/未知 provider/403)+ client SSR 9 项
  (两类面板渲染/徽章/错误/过期/配置迁移),全部通过。

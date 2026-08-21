# RELEASE v0.1.0 — dsh-opencode-go-usage

## 新增

首个版本:OpenCode Go 剩余额度实时小窗。

- **右侧常驻小窗**(`shell.overlay` 官方加性席位,scope root):当前会话模型来自 OpenCode Go 时显示,展示 5h 滚动 / 本周 / 本月三个配额窗口的剩余百分比与重置倒计时;模型切换到其它 provider 自动隐藏。
- **折叠徽章**:点击「—」折叠为「Go 剩 xx%」小徽章,点击展开。
- **实时刷新**:默认 30s 轮询;会话切换、`connection/reset` 重连、切回浏览器前台时立即刷新;小窗内可直接手动刷新。
- **服务端代理数据通路**:host half 自动识别 DSH settings 中的 OpenCode Go provider(id `opencode-go` 或 baseURL 含 `opencode.ai/zen`),经 `credentials` 服务解析 API key,代理调用 OpenCode 官方(未文档化)接口 `GET https://opencode.ai/zen/go/v1/usage`;key 不出服务器、不写日志;15s TTL + 单飞去重。
- **错误兜底**:key 未配置 / 鉴权失败 / 未绑定 Go 订阅 / 上游不可达,均显示错误文案 + 重试;连续失败保留最后一次数据并标「数据过期」。
- **设置页**:「设置 → OpenCode Go 额度」——启用开关、provider id 覆盖、刷新间隔(15/30/60/120s)、显示哪些窗口、默认折叠;localStorage 持久化。

## 兼容性

- 纯插件实现,不修改 DSH 本体;按官方方式安装:`dsh plugin add`(包内声明 `dsh.bundle.patch`,一步激活,无需手动编辑 profile 配置);卸载 `dsh plugin remove`。
- 依赖 OpenCode Go 官方 `GET /zen/go/v1/usage` 接口(社区发现的事实标准,未写入官方文档;URL 集中于 `lib/index.js` 顶部常量,上游变更改一行即可)。

## 已知限制

- 额度按 API key(订阅)计,不区分会话;多订阅切换不在本版本范围。
- 不做美元金额换算(社区换算口径不一致,仅展示官方 `percent`)。

## 验证清单

- [x] `curl http://<dsh-address>/plugins/@deepseek-ai/dsh-opencode-go-usage/client.js` 以 `window.__ModuleLoader__.load(` 开头
- [x] `curl http://<dsh-address>/dsh-opencode-go-usage/usage` 返回 `ok:true` 且数值与 opencode.ai 工作区页面一致
- [x] 当前模型为 opencode-go → 右侧出现小窗;`/model` 切换到其它 provider → 消失;切回 → 恢复
- [x] 折叠/展开、设置页改刷新间隔即时生效;窗口行下进度条(绿→橙→红)显示剩余比例
- [x] 卸载(`dsh plugin remove` + 重启)后无残留
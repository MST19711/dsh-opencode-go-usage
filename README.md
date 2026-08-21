# Go Meter — DSH 的 OpenCode Go 剩余额度实时小窗

> 产品名 **Go Meter**;npm 包名 / 仓库名 `@deepseek-ai/dsh-opencode-go-usage`。介绍文案见 [GITHUB_INTRO.md](GITHUB_INTRO.md)。

当当前会话使用的模型来自 **OpenCode Go** 订阅时,在 DSH Web 界面**右侧边缘**显示一个常驻小窗,实时展示三个配额窗口的剩余额度:

- **5h 滚动**(rolling):最近 5 小时滚动窗口
- **本周**(weekly):自然周
- **本月**(monthly):自然月/订阅周期

每行显示「剩余百分比 + 重置倒计时」,行下为绿色进度条(自左向右表示剩余比例);剩余 ≤30% 转橙,≤10% 转红。模型切换到其他 provider 时小窗自动隐藏。

## 特性

- 📍 右侧浮层小窗(`shell.overlay` 官方加性席位),不遮挡任何列;可折叠为小徽章「Go 剩 xx%」
- 🔄 自动刷新(默认 30s,可配 15/60/120s;会话切换、重连、切回前台时立即刷新)
- ⚙️ 设置页可配:启用开关、provider id、刷新间隔、显示的窗口、默认折叠
- 🔐 代理式数据通路:插件服务端半区经 DSH `credentials` 服务解析 API key,调 OpenCode 官方 `GET https://opencode.ai/zen/go/v1/usage`;**key 永不进入浏览器、不写日志**
- 🛡️ 错误兜底:key 未配置 / 鉴权失败 / 未绑定订阅均给出可见错误并可重试;连续失败保留旧数据并标记「数据过期」

## 界面

- 小窗:右上角小卡片,标题 + 当前模型名 + 三窗口行(剩余% + 倒计时,行下进度条)+「更新于 HH:MM:SS」
- 折叠态:右侧小圆点徽章「Go 剩 xx%」,点击展开
- 设置:「设置 → OpenCode Go 额度」

## 安装(官方方式)

前置:dsh 已安装且目标 profile(默认 `web`)在运行。本插件通过官方的 `dsh plugin add` 安装(`dsh plugin` 是 pnpm 的薄转发层);包内声明了 `dsh.bundle.patch`(自带 `cordis.patch.yml`),因此 **`plugin add` 一步即可完成安装,无需手动编辑任何 profile 配置**。

```bash
# 方式一:仓库脚本(自动 npm pack + dsh plugin add)
bash install.sh

# 方式二:手动执行官方命令
npm pack -y                        # 产物 deepseek-ai-dsh-opencode-go-usage-<ver>.tgz
dsh --profile web plugin add ./deepseek-ai-dsh-opencode-go-usage-<ver>.tgz
```

安装成功后**重启 dsh**(让 profile 重新组合 bundle 层),刷新浏览器即可看到小窗。

## 验证

重启并刷新页面后:

- 当前会话模型为 `opencode-go`(或 baseURL 指向 opencode.ai/zen 的 provider)→ 右侧出现小窗,三窗口数值应与 opencode.ai 工作区页面一致;
- `/model` 切到其它 provider → 小窗消失,切回恢复;
- 命令行核对(把 `<dsh-address>` 换成你实际访问 dsh 的地址):
  ```bash
  # 客户端插件已加载(应以 window.__ModuleLoader__.load( 开头)
  curl -s http://<dsh-address>/plugins/@deepseek-ai/dsh-opencode-go-usage/client.js | head -c 80
  # 代理端点:ok:true 且三窗口数值与 opencode.ai 工作区页面一致
  curl -s http://<dsh-address>/dsh-opencode-go-usage/usage
  ```

## 数据来源与口径

- 上游:OpenCode 官方(未文档化)用量接口 `GET https://opencode.ai/zen/go/v1/usage`,鉴权 `Authorization: Bearer <key>`(另带 `x-api-key`);返回三个窗口 `{status, percent, resetsAt}`,`percent` 为**已用百分比**,小窗显示**剩余 = 100 − percent**。
- 接口由社区经 [cc-switch#6433](https://github.com/farion1231/cc-switch/issues/6433)(2026-08-13) 公开,OpenCodeMonitor 等项目生产使用;未写入官方文档,若上游变更地址,改 `lib/index.js` 顶部 `USAGE_URL` 常量即可。
- Provider 识别:DSH settings 中 id 为 `opencode-go` 的 provider,或自定义 provider 的 baseURL 含 `opencode.ai/zen`;取其 `apiKeyEnv` 指向的凭据(dsh-credentials 解析,支持 env/文件)。
- 服务端 15s 缓存 + 单飞去重,轮询不会打爆上游。

## 卸载(官方方式)

```bash
dsh --profile web plugin remove @deepseek-ai/dsh-opencode-go-usage
```

随后重启 dsh 并刷新页面;`plugin remove` 会自动把本插件从 `dsh.profile.bundles` 层移除(不再加载),无需手动清理配置。

## 打包与发布

```bash
npm pack          # 产物 deepseek-ai-dsh-opencode-go-usage-<ver>.tgz(已被 .gitignore 排除,不入库)
```

发布到 npm 前把 `package.json` 的 `"private": true` 去掉;GitHub 仓库发布无需改动。

## License

[MIT](LICENSE.md)
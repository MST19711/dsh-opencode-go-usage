# Go Meter — OpenCode Go 剩余额度实时仪表

> 发布名称(产品名):**Go Meter**(中文:「Go 额度仪表」)
> npm 包名 / GitHub 仓库名:**`dsh-opencode-go-usage`**(与安装链路一致,便于检索)
>
> 命名理由:仪表(Meter)即"实时计量剩余额度"的意象;Go 直接来自 OpenCode Go
> 订阅名;产品名不带 "dsh" 前缀方便 UI 标题与口播,仓库名保留前缀便于被搜到。

## GitHub About(一句话,二选一)

- EN:`Floating OpenCode Go quota meter for the DSH Web UI — live remaining % for the 5h / weekly / monthly windows.`
- 中:`DSH Web 界面右侧的 OpenCode Go 剩余额度实时仪表:5h / 周 / 月三窗口剩余百分比与重置倒计时。`

## 话题标签(Topics)

`dsh-plugin` `opencode` `opencode-go` `quota` `devtools` `web-ui`

## README 简介段落(可置于 README 开头)

**Go Meter** 是一个为 DeepSeek Harness(DSH)Web 界面打造的 OpenCode Go 配额仪表:
当当前会话的模型来自 OpenCode Go 订阅时,界面右侧浮出一个小窗,实时显示三个
配额窗口的剩余额度 —— 滚动 5 小时、本周、本月 —— 每个窗口带剩余百分比、
重置倒计时与一条随余量变色的进度条。模型切换到其他服务商时,小窗自动隐身。

插件完全遵循 DSH 官方插件规范:通过 `dsh plugin add` 一步安装(包内自带
`dsh.bundle.patch`),服务端半区代理 OpenCode 官方用量接口(`/zen/go/v1/usage`),
API key 经 DSH 凭据服务解析,永不进入浏览器。

## Release 标题建议

- `v0.1.0 — Go Meter:OpenCode Go remaining-quota widget`
- 中文:v0.1.0 — Go Meter:OpenCode Go 剩余额度实时仪表

## 发布物料清单

| 物料 | 文件 |
| --- | --- |
| 代码(双半区) | `lib/index.js` + `lib/client.js` |
| 安装脚本 | `install.sh`(`npm pack` + `dsh plugin add`) |
| 文档 | `README.md` / `RELEASE_NOTES-v0.1.0.md` / `LICENSE.md` |
| 此介绍 | `GITHUB_INTRO.md` |
/**
 * dsh-opencode-go-usage — Client half (v0.1.0)
 *
 * 当当前会话的模型来自 OpenCode Go 订阅时,在界面右侧边缘显示常驻小窗:
 * 实时展示 5h 滚动 / 本周 / 本月三个配额窗口的「剩余百分比 + 重置倒计时」。
 * 模型切换到其它 provider 时小窗自动隐藏。
 *
 * 数据通路:同源 GET /dsh-opencode-go-usage/usage(host half 代理 opencode
 * 官方 /v1/usage,key 不出服务器)。本端只负责轮询、判定可见性、渲染。
 *
 * 可见性判定:当前会话(无会话/子代理会话则隐藏)的 current.provider ∈
 * 服务端返回的 providerIds,或等于设置中的 providerId 覆盖值。
 *
 * License: MIT
 */
window.__ModuleLoader__.load({
  id: "@deepseek-ai/dsh-opencode-go-usage",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const React = require("react");

    //#region styles
    const CSS_NAMESPACE = "dogu"; // dsh opencode go usage
    const css = `
      .${CSS_NAMESPACE}-card {
        position: absolute; right: 36px; top: 92px; width: 212px;
        box-sizing: border-box; padding: 10px 12px;
        border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px;
        background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
        box-shadow: var(--dsw-shadow-lv3); font-size: 12px; line-height: 1.45;
        display: flex; flex-direction: column; gap: 6px;
        pointer-events: auto; z-index: 10;
      }
      .${CSS_NAMESPACE}-head { display: flex; align-items: center; gap: 6px; }
      .${CSS_NAMESPACE}-title { font-size: 13px; font-weight: 600; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .${CSS_NAMESPACE}-model { font-size: 11px; color: var(--dsw-alias-label-tertiary); min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .${CSS_NAMESPACE}-btn {
        flex: none; cursor: pointer; border: 1px solid var(--dsw-alias-border-l2);
        border-radius: 6px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary);
        font-size: 11px; line-height: 16px; padding: 1px 6px; font-family: inherit;
      }
      .${CSS_NAMESPACE}-btn:hover { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
      .${CSS_NAMESPACE}-row { display: flex; flex-direction: column; gap: 4px; }
      .${CSS_NAMESPACE}-rowTop { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
      .${CSS_NAMESPACE}-rowLabel { flex: 0 0 52px; color: var(--dsw-alias-label-secondary); }
      .${CSS_NAMESPACE}-rowVal { flex: 1; min-width: 0; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
      .${CSS_NAMESPACE}-bar { display: block; height: 6px; border-radius: 3px; background: var(--dsw-alias-bg-module-platform); overflow: hidden; }
      .${CSS_NAMESPACE}-barFill { display: block; height: 100%; border-radius: 3px; background: var(--dsw-alias-state-success-primary); }
      .${CSS_NAMESPACE}-barFill.warn { background: var(--dsw-alias-state-warn-primary); }
      .${CSS_NAMESPACE}-barFill.danger { background: var(--dsw-alias-state-error-primary); }
      .${CSS_NAMESPACE}-err { color: var(--dsw-alias-state-error-primary); font-size: 11px; line-height: 1.5; word-break: break-all; }
      .${CSS_NAMESPACE}-stale { color: var(--dsw-alias-state-warn-primary); font-size: 11px; }
      .${CSS_NAMESPACE}-foot { color: var(--dsw-alias-label-tertiary); font-size: 10px; display: flex; justify-content: space-between; gap: 6px; }
      .${CSS_NAMESPACE}-chip {
        position: absolute; right: 36px; top: 92px; cursor: pointer;
        border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px;
        background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
        box-shadow: var(--dsw-shadow-lv2); padding: 3px 10px; font-size: 12px; font-weight: 500;
        pointer-events: auto; z-index: 10; display: inline-flex; align-items: center; gap: 5px; font-family: inherit;
      }
      .${CSS_NAMESPACE}-chip:hover { border-color: var(--dsw-alias-brand-primary); }
      .${CSS_NAMESPACE}-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dsw-alias-state-success-primary); }
      .${CSS_NAMESPACE}-dot.warn { background: var(--dsw-alias-state-warn-primary); }
      .${CSS_NAMESPACE}-dot.danger { background: var(--dsw-alias-state-error-primary); }
      .${CSS_NAMESPACE}-panel { max-width: 520px; display: flex; flex-direction: column; gap: 8px; }
      .${CSS_NAMESPACE}-group { display: flex; flex-direction: column; gap: 8px; padding: 8px 0; border-top: 1px solid var(--dsw-alias-border-l1); }
      .${CSS_NAMESPACE}-check { display: flex; align-items: center; gap: 6px; font-weight: 600; cursor: pointer; }
      .${CSS_NAMESPACE}-check input { accent-color: var(--dsw-alias-brand-primary); }
      .${CSS_NAMESPACE}-field { display: flex; align-items: center; gap: 8px; color: var(--dsw-alias-label-secondary); }
      .${CSS_NAMESPACE}-field input[type='text'], .${CSS_NAMESPACE}-field select {
        padding: 3px 6px; font-size: 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px;
        background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary);
      }
      .${CSS_NAMESPACE}-note { color: var(--dsw-alias-label-tertiary); font-size: 12px; }
      .${CSS_NAMESPACE}-link { color: var(--dsw-alias-brand-primary); text-decoration: none; }
    `;
    const tagId = "@deepseek-ai/dsh-opencode-go-usage/widget.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "@deepseek-ai/dsh-opencode-go-usage";
      tag.dataset.pluginCss = tagId;
      tag.textContent = css;
      document.head.appendChild(tag);
    }
    //#endregion

    //#region config
    const STORAGE_KEY = "dsh-opencode-go-usage:config";
    const DEFAULTS = {
      enabled: true,
      providerId: "opencode-go", // 覆盖/附加判定 id(服务端自动识别优先)
      refreshSeconds: 30,
      showRolling: true,
      showWeekly: true,
      collapsed: false, // 上次折叠态;设置页单独存默认折叠
      collapsedDefault: false,
    };

    function loadConfig() {
      let saved = null;
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw !== null) saved = JSON.parse(raw);
      } catch (error) { saved = null; }
      if (saved === null || typeof saved !== "object") return { ...DEFAULTS };
      return {
        enabled: typeof saved.enabled === "boolean" ? saved.enabled : DEFAULTS.enabled,
        providerId: typeof saved.providerId === "string" && saved.providerId.length > 0 ? saved.providerId : DEFAULTS.providerId,
        refreshSeconds: Number.isFinite(saved.refreshSeconds) ? Math.max(10, Math.min(3600, saved.refreshSeconds)) : DEFAULTS.refreshSeconds,
        showRolling: typeof saved.showRolling === "boolean" ? saved.showRolling : DEFAULTS.showRolling,
        showWeekly: typeof saved.showWeekly === "boolean" ? saved.showWeekly : DEFAULTS.showWeekly,
        collapsed: typeof saved.collapsed === "boolean" ? saved.collapsed : DEFAULTS.collapsed,
        collapsedDefault: typeof saved.collapsedDefault === "boolean" ? saved.collapsedDefault : DEFAULTS.collapsedDefault,
      };
    }
    function saveConfig(cfg) {
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); return true; } catch (error) { return false; }
    }
    //#endregion

    //#region store
    // 极简快照 store:update 生成新对象并通知订阅者(渲染侧 useReducer 订阅)。
    let snapshot = {
      status: "idle", // idle | ready | error | stale
      data: null,     // /usage 成功响应:{usage, providerIds, providerName, at, ...}
      error: null,
      hasSession: false,
      addressed: false,
      currentProvider: null,
      currentModel: null,
      lastRefreshAt: 0, // 最近一次轮询结束时间(本地)
    };
    const listeners = new Set();
    function notify() {
      for (const fn of [...listeners]) { try { fn(); } catch (error) { console.log("dsh-opencode-go-usage: listener failed", error); } }
    }
    function update(patch) {
      snapshot = { ...snapshot, ...patch };
      notify();
    }
    function subscribe(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    }
    //#endregion

    //#region helpers
    function fmtCountdown(iso) {
      if (typeof iso !== "string" || iso.length === 0) return "";
      const ms = new Date(iso).getTime() - Date.now();
      if (!Number.isFinite(ms)) return "";
      if (ms <= 0) return "即将重置";
      const s = Math.floor(ms / 1000);
      const d = Math.floor(s / 86400);
      const h = Math.floor((s % 86400) / 3600);
      const m = Math.floor((s % 3600) / 60);
      if (d > 0) return d + "d " + h + "h";
      if (h > 0) return h + "h " + m + "m";
      if (m > 0) return m + "m";
      return "不足1m";
    }
    function toneOf(remaining) {
      if (remaining <= 10) return "danger";
      if (remaining <= 30) return "warn";
      return "ok";
    }
    function fmtTime(ts) {
      if (!Number.isFinite(ts) || ts <= 0) return "";
      const d = new Date(ts);
      const p = (n) => String(n).padStart(2, "0");
      return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
    }
    //#endregion

    //#region data flow
    let appCtx = null;
    let watchers = null; // { dispose: () => void }

    function computeVisible(snap, cfg) {
      if (!cfg.enabled) return false;
      if (!snap.hasSession || snap.addressed) return false;
      if (snap.currentProvider === null || snap.data === null) return false;
      const ids = Array.isArray(snap.data.providerIds) ? snap.data.providerIds : [];
      return ids.includes(snap.currentProvider) || snap.currentProvider === cfg.providerId;
    }

    async function refreshUsage() {
      if (appCtx === null) return;
      try {
        const res = await fetch("/dsh-opencode-go-usage/usage");
        if (!res.ok) throw new Error("http " + res.status);
        const body = await res.json();
        if (body === null || typeof body !== "object") throw new Error("bad response");
        if (body.ok !== true) {
          const err = body.error && typeof body.error === "object"
            ? body.error
            : { code: "UNKNOWN", message: String(body) };
          update({
            error: err,
            status: snapshot.data !== null ? "stale" : "error",
            lastRefreshAt: Date.now(),
          });
          return;
        }
        update({
          data: body,
          error: null,
          status: "ready",
          lastRefreshAt: Date.now(),
        });
      } catch (error) {
        update({
          error: { code: "FETCH_FAILED", message: error && error.message ? String(error.message) : String(error) },
          status: snapshot.data !== null ? "stale" : "error",
          lastRefreshAt: Date.now(),
        });
      }
    }

    async function refreshModelInfo() {
      if (appCtx === null) return;
      const list = appCtx.sessions && appCtx.sessions.list ? appCtx.sessions.list : null;
      const snap = list ? list.getSnapshot() : undefined;
      const sid = snap !== undefined && snap !== null ? snap.current : undefined;
      if (sid === undefined || sid === null) {
        update({ hasSession: false, addressed: false, currentProvider: null, currentModel: null });
        return;
      }
      let addressed = false;
      try {
        addressed = typeof appCtx.sessions.subagentAddress === "function" && appCtx.sessions.subagentAddress(sid) !== undefined;
      } catch (error) {
        addressed = false;
      }
      if (addressed) {
        update({ hasSession: true, addressed: true, currentProvider: null, currentModel: null });
        return;
      }
      update({ hasSession: true, addressed: false });
      try {
        const connection = typeof appCtx.get === "function" ? appCtx.get("connection") : undefined;
        const api = connection !== undefined ? connection.api : undefined;
        if (api === undefined || typeof api.sessions?.models !== "function") {
          update({ currentProvider: null, currentModel: null });
          return;
        }
        const { result } = await api.sessions.models({ sessionId: sid });
        if (!result.ok) {
          update({ currentProvider: null, currentModel: null });
          return;
        }
        const current = result.value && typeof result.value === "object" ? result.value.current : undefined;
        update({
          currentProvider: current && typeof current.provider === "string" ? current.provider : null,
          currentModel: current && typeof current.model === "string" ? current.model : null,
        });
      } catch (error) {
        update({ currentProvider: null, currentModel: null });
      }
    }

    function setupWatchers() {
      teardownWatchers();
      const cfg = loadConfig();
      const ms = cfg.refreshSeconds * 1000;
      const timers = [];

      // 轮询:额度 + 当前模型/provider
      const refreshTick = () => { refreshUsage(); refreshModelInfo(); };
      try {
        timers.push(appCtx.timer.interval(refreshTick, ms));
      } catch (error) {
        console.log("dsh-opencode-go-usage: timer 不可用", error);
      }

      // 会话变化(切换会话/无会话)
      let listDisposer = null;
      try {
        listDisposer = appCtx.sessions.list.subscribe(() => {
          refreshModelInfo();
          refreshUsage();
        });
      } catch (error) {
        console.log("dsh-opencode-go-usage: 会话列表订阅失败", error);
      }

      // 切回前台立即刷新
      const onVisibility = () => { if (document.visibilityState === "visible") { refreshUsage(); refreshModelInfo(); } };
      document.addEventListener("visibilitychange", onVisibility);

      watchers = {
        dispose: () => {
          for (const t of timers) { try { t(); } catch (error) {} }
          if (listDisposer !== null) { try { listDisposer(); } catch (error) {} }
          document.removeEventListener("visibilitychange", onVisibility);
        },
      };
    }

    function teardownWatchers() {
      if (watchers !== null) {
        try { watchers.dispose(); } catch (error) {}
        watchers = null;
      }
    }
    //#endregion

    //#region widget
    /** 距右侧边框的间距;小窗顶部距 banner(标签栏)底部的距离与之保持一致。 */
    const EDGE_GAP = 36;

    /**
    * 运行时测量:小窗顶部 = banner 标签栏底部 + EDGE_GAP,使「距 banner 的距离」
    * 与「距右侧边框的距离」相同。标签栏随 DSH 版本布局变化,故不硬编码高度。
    * 找不到标签栏/浮层时返回 null,由调用方回退到静态 top。
    */
    function measureBannerTop() {
      try {
        const doc = window.document;
        const tablist = doc.querySelector('[data-slot="conversation"] [role="tablist"]')
          ?? doc.querySelector('[data-slot="conversation.session"] [role="tablist"]')
          ?? doc.querySelector('[role="tablist"]');
        const overlay = doc.querySelector("[data-shell-overlay]");
        if (tablist === null || overlay === null) return null;
        const tabBottom = tablist.getBoundingClientRect().bottom;
        const overlayTop = overlay.getBoundingClientRect().top;
        const top = tabBottom - overlayTop + EDGE_GAP;
        if (!Number.isFinite(top)) return null;
        return Math.max(0, Math.round(top));
      } catch (error) {
        return null;
      }
    }

    function Row({ label, entry }) {
      const remaining = typeof entry.remaining === "number" ? entry.remaining : null;
      const tone = remaining === null ? "ok" : toneOf(remaining);
      const fill = remaining === null ? 0 : Math.max(0, Math.min(100, remaining));
      const countdown = entry.resetsAt ? fmtCountdown(entry.resetsAt) : "";
      return React.createElement(
        "div", { className: CSS_NAMESPACE + "-row" },
        React.createElement(
          "div", { className: CSS_NAMESPACE + "-rowTop" },
          React.createElement("span", { className: CSS_NAMESPACE + "-rowLabel" }, label),
          React.createElement("span", { className: CSS_NAMESPACE + "-rowVal" },
            remaining === null ? "—" : "剩 " + remaining + "%" + (countdown ? " · " + countdown : "")),
        ),
        React.createElement("span", { className: CSS_NAMESPACE + "-bar" },
          React.createElement("span", {
            className: CSS_NAMESPACE + "-barFill " + tone,
            style: { width: fill + "%" },
          })),
      );
    }

    function Widget() {
      const [, force] = React.useReducer((x) => x + 1, 0);
      React.useEffect(() => subscribe(force), []);
      const snap = snapshot;
      const cfg = loadConfig();
      const [collapsed, setCollapsed] = React.useState(cfg.collapsed);
      React.useEffect(() => { setCollapsed(cfg.collapsed); }, [cfg.collapsed]);
      // banner 位置随标签切换/窗口缩放变化:resize 时重测,数据刷新周期内保持
      const [tick, setTick] = React.useState(0);
      React.useEffect(() => {
        const onResize = () => setTick((t) => t + 1);
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
      }, []);
      const bannerTop = React.useMemo(() => measureBannerTop(), [snap.lastRefreshAt, snap.status, tick, collapsed]);
      const top = bannerTop === null ? 92 : bannerTop;

      const visible = computeVisible(snap, cfg);
      const data = snap.data;
      if (!visible || data === null) return null;

      const monthly = data.usage && typeof data.usage === "object" ? data.usage.monthly : null;
      const fallback = data.usage.weekly !== null ? 100 - data.usage.weekly.percent : null;
      const badgeRemaining = monthly !== null && typeof monthly.remaining === "number"
        ? monthly.remaining
        : fallback;
      const title = (data.providerName && String(data.providerName).length > 0 ? String(data.providerName) : "OpenCode Go");

      if (collapsed) {
        const tone = badgeRemaining === null ? "ok" : toneOf(badgeRemaining);
        return React.createElement(
          "button",
          {
            type: "button",
            className: CSS_NAMESPACE + "-chip",
            style: { top: top + "px" },
            title: "OpenCode Go 额度(" + (snap.currentModel || "") + ") — 点击展开",
            onClick: () => { setCollapsed(false); },
          },
          React.createElement("span", { className: CSS_NAMESPACE + "-dot " + tone }),
          "Go 剩 " + (badgeRemaining === null ? "?" : badgeRemaining + "%"),
        );
      }

      const rows = [];
      const add = (key, label) => {
        const entry = data.usage[key];
        if (entry !== null && entry !== undefined) rows.push(React.createElement(Row, { key: key, label: label, entry: entry }));
      };
      if (cfg.showRolling) add("rolling", "5h 滚动");
      if (cfg.showWeekly) add("weekly", "本周");
      add("monthly", "本月");

      const errorNode = snap.status === "error" || snap.status === "stale" ? (snap.error !== null
        ? React.createElement(
            "div", { className: CSS_NAMESPACE + "-err" },
            String(snap.error.message || snap.error.code || "未知错误"),
            React.createElement("br"),
            React.createElement(
              "button",
              { type: "button", className: CSS_NAMESPACE + "-btn", onClick: () => { refreshUsage(); } },
              "重试",
            ),
          )
        : null) : null;
      const staleNode = snap.status === "stale"
        ? React.createElement("div", { className: CSS_NAMESPACE + "-stale" }, "数据过期,等待下一次刷新")
        : null;

      return React.createElement(
        "div", { className: CSS_NAMESPACE + "-card", style: { top: top + "px" } },
        React.createElement(
          "div", { className: CSS_NAMESPACE + "-head" },
          React.createElement("span", { className: CSS_NAMESPACE + "-title" }, title),
          React.createElement(
            "button",
            { type: "button", className: CSS_NAMESPACE + "-btn", title: "立即刷新", onClick: () => { refreshUsage(); refreshModelInfo(); } },
            "刷新",
          ),
          React.createElement(
            "button",
            { type: "button", className: CSS_NAMESPACE + "-btn", title: "折叠", onClick: () => { setCollapsed(true); } },
            "—",
          ),
        ),
        snap.currentModel !== null
          ? React.createElement("div", { className: CSS_NAMESPACE + "-model" }, String(snap.currentModel))
          : null,
        rows,
        errorNode,
        staleNode,
        React.createElement(
          "div", { className: CSS_NAMESPACE + "-foot" },
          React.createElement("span", null, "更新于 " + fmtTime(snap.lastRefreshAt)),
          React.createElement("span", null, "Go 订阅"),
        ),
      );
    }
    //#endregion

    //#region settings panel
    function Panel() {
      const [cfg, setCfg] = React.useState(loadConfig());
      const save = (patch) => {
        const next = { ...cfg, ...patch };
        setCfg(next);
        saveConfig(next);
        if (patch.refreshSeconds !== undefined || patch.enabled !== undefined || patch.providerId !== undefined) {
          setupWatchers(); // 间隔/开关/判定 id 变更立即生效
        }
      };
      return React.createElement(
        "div", { className: CSS_NAMESPACE + "-panel" },
        React.createElement("label", { className: CSS_NAMESPACE + "-check" },
          React.createElement("input", { type: "checkbox", checked: cfg.enabled, onChange: (e) => save({ enabled: e.target.checked }) }),
          "启用 OpenCode Go 额度小窗"),
        React.createElement(
          "div", { className: CSS_NAMESPACE + "-group" },
          React.createElement(
            "label", { className: CSS_NAMESPACE + "-field" },
            React.createElement("span", null, "Provider id"),
            React.createElement("input", {
              type: "text",
              value: cfg.providerId,
              onChange: (e) => save({ providerId: e.target.value }),
            }),
          ),
          React.createElement(
            "label", { className: CSS_NAMESPACE + "-field" },
            React.createElement("span", null, "刷新间隔"),
            React.createElement("select", { value: String(cfg.refreshSeconds), onChange: (e) => save({ refreshSeconds: Number(e.target.value) }) },
              React.createElement("option", { value: "15" }, "15 秒"),
              React.createElement("option", { value: "30" }, "30 秒"),
              React.createElement("option", { value: "60" }, "60 秒"),
              React.createElement("option", { value: "120" }, "120 秒"),
            ),
          ),
          React.createElement("label", { className: CSS_NAMESPACE + "-check" },
            React.createElement("input", { type: "checkbox", checked: cfg.showRolling, onChange: (e) => save({ showRolling: e.target.checked }) }),
            "显示 5h 滚动窗口"),
          React.createElement("label", { className: CSS_NAMESPACE + "-check" },
            React.createElement("input", { type: "checkbox", checked: cfg.showWeekly, onChange: (e) => save({ showWeekly: e.target.checked }) }),
            "显示本周窗口"),
          React.createElement("label", { className: CSS_NAMESPACE + "-check" },
            React.createElement("input", { type: "checkbox", checked: cfg.collapsedDefault, onChange: (e) => save({ collapsedDefault: e.target.checked }) }),
            "加载时默认折叠为小徽章"),
        ),
        React.createElement(
          "div", { className: CSS_NAMESPACE + "-note" },
          "额度来自 OpenCode 官方接口 GET opencode.ai/zen/go/v1/usage(由插件服务端代理,",
          "API key 不会进入浏览器)。当前模型不属于 OpenCode Go 时小窗自动隐藏。",
          "连续失败时保留最后一次数据并标记「数据过期」。",
        ),
      );
    }
    //#endregion

    //#region plugin body
    const inject = ["slots", "sessions", "timer"];

    function apply(ctx) {
      appCtx = ctx;
      setupWatchers();       // 会话/模型/额度轮询
      refreshUsage();        // 首帧立即拉取
      refreshModelInfo();

      ctx.on("connection/reset", () => {
        teardownWatchers();
        setupWatchers();
        refreshUsage();
        refreshModelInfo();
      });

      // 右上浮层小窗(官方槽位目录:shell.overlay 是「frame-wide surface of your own」的加性席位)
      ctx.slots.inject("shell.overlay", () => ctx.slots.register({
        name: "shell.overlay",
        id: "opencode-go-usage",
        order: 100,
        label: "OpenCode Go 额度",
      }, Widget));

      // 设置页
      ctx.slots.inject("settings.section", () => ctx.slots.register({
        name: "settings.section",
        id: "opencode-go-usage",
        order: 26,
        label: "OpenCode Go 额度",
      }, Panel));

      ctx.effect(() => () => {
        teardownWatchers();
        appCtx = null;
      });
    }
    //#endregion

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
# ACE0 ST Bridge 脚本收口说明

## 目标

`apps/st-bridge/bridge.js` 是酒馆侧唯一稳定入口。酒馆助手脚本只负责加载 bridge；bridge 负责选择环境、加载 manifest、顺序加载 pack 脚本、发布应用 URL、提供 MVU IO 和动作分发。

业务逻辑不写在 bridge 里。ACT、资产、遭遇、战斗、角色文档、Dashboard loader 都放在 `apps/st-bridge/packs/acezero-main/*` 对应模块里。

## 入口脚本

生产入口：

```js
window.ST_BRIDGE_PACK = 'acezero-main';
window.ST_BRIDGE_ENV = 'prod';
window.ST_BRIDGE_URL = 'https://hasheeper.github.io/ace-zero/apps/st-bridge/bridge.js';
import 'https://hasheeper.github.io/ace-zero/apps/st-bridge/bridge.js?env=prod&v=fix-url';
```

本机入口：

```js
window.ST_BRIDGE_PACK = 'acezero-main';
window.ST_BRIDGE_ENV = 'local';
window.ACE0_APP_BASE_URL = 'http://127.0.0.1:4173';
window.ST_BRIDGE_URL = 'http://127.0.0.1:4173/apps/st-bridge/bridge.js';
import 'http://127.0.0.1:4173/apps/st-bridge/bridge.js?env=local&force=1&v=dev';
```

本机静态服务：

```sh
node apps/st-bridge/scripts/serve-local.mjs --port 4173 --root .
```

本机静态服务必须从仓库根目录启动，并兼容 `/ace-zero/...` 子路径别名。这样生产页面在 GitHub Pages 下生成的 `/ace-zero/assets/...`、`/ace-zero/games/...` 资源路径，在本机服务下也能映射回仓库根目录，避免德州 SVG、牌面、legacy game 资源因为本机路径少一层 `/ace-zero` 而 404。

## Bridge 职责

`bridge.js` 负责：

- 解析 `env=prod|local`，默认按 bridge URL 判断本机或生产。
- 解析 `appBase`，生产默认 `https://hasheeper.github.io/ace-zero`，本机默认 `http://127.0.0.1:4173`。
- 解析临时 `worldbook` 覆盖，但世界书默认名不在 bridge 中写死。
- 从 `manifest.json` 加载 pack 脚本，并保持 manifest 中的脚本顺序。
- 发布 `STBridge.state` 和 `STBridge.utils`。
- 发布 `ACE0_GAME_APP_URL`、`ACE0_DASHBOARD_APP_URL`、`ACE0_ACT_RESULT_APP_URL`。
- 提供 `STBridge.mvu.readVariables/writeVariables/readState/writeState/patchState`。
- 提供 `STBridge.registerActions()` 和 `STBridge.dispatch()`。
- 显示加载中、加载完成、加载失败提示。

`manifest.json` 只描述 pack 元信息和脚本列表，不再回灌 `globals`。应用 URL 统一由 bridge 的 `resolveAppUrl()` 生成。

## 应用 URL

唯一 URL 规则在 `STBridge.utils.resolveAppUrl(app)`：

- `game` -> `{appBase}/index.html?app=game`
- `dashboard` -> `{appBase}/index.html?app=dashboard`
- `act-result` -> `{appBase}/apps/act-result/index.html`

生产 wrapper：

- `st/wrappers/STver.html`
- `st/wrappers/ACT_RESULT.html`

生产 wrapper 解析顺序：

1. bridge 发布的 `ACE0_*_APP_URL`
2. `STBridge.utils.resolveAppUrl()`
3. GitHub Pages fallback

本机 wrapper：

- `st/wrappers/local/STver.local.html`
- `st/wrappers/local/ACT_RESULT.local.html`

本机 wrapper 直接硬编码 `http://127.0.0.1:4173`，没有 GitHub fallback。断网测试时如果还请求 GitHub Pages，说明酒馆正则仍贴着生产 wrapper，或酒馆助手脚本仍在加载生产 bridge。

`ACT_RESULT` wrapper 的高度同步有两条路径：

- `apps/act-result` 主动 postMessage `acezero-act-result-size`。
- wrapper 在同源可读时主动测量 `.mech-widget`、`body`、`documentElement` 高度。

不要把内层 iframe 高度更新绑定到 `window.frameElement` 是否存在；酒馆正则直接注入 HTML 时可能没有宿主 iframe，但仍然需要把 `#act-result-frame` 拉到内容高度。

## 世界书 Profile

完整角色文档世界书名只允许写在：

```text
apps/st-bridge/packs/acezero-main/tavern/worldbook-profile.js
```

当前 profile：

- `prod`: `AceZeroInfo-MVUVer-alpha2.0`
- `local`: `AceZeroInfo-MVUVer-alpha2.0-Test`

`tavern/plugin.js` 和 `tavern/character-runtime.js` 都通过 `ACE0WorldbookProfile.applyFullDocWorldbookProfile()` 读取最终名称。旧的 `ACE0_WORLDBOOK_PROFILE`、`ACE0_FULL_DOC_WORLDBOOK_SOURCE`、`__ACE0_APPLIED_FULL_DOC_WORLDBOOK__` 不再作为运行时接口。

临时测试世界书时，必须显式写：

```js
window.ACE0_FULL_DOC_WORLDBOOK_OVERRIDE = true;
window.ACE0_FULL_DOC_WORLDBOOK_NAME = '临时世界书名';
```

不要只写 `ACE0_FULL_DOC_WORLDBOOK_NAME`，否则会被 profile 纠正回当前环境默认值。

## Pack 模块边界

`acezero-main` pack 当前分层：

- `schema/acezero-schema.js`: MVU schema 注册与变量归一。
- `asset/*`: 资产 catalog、runtime、summary。
- `act/data.js`: ACT 静态章节与遭遇配置。
- `act/generated-*`: 路线图和生成式节点运行时。
- `act/narrative-runtime.js`: ACT 叙事摘要、节奏、事件池、转场 prompt。
- `act/frontend-snapshot.js`: Dashboard/frontend snapshot 投影。
- `act/encounter-runtime.js`: compact 遭遇账本读写、投放、消费。
- `act/plugin.js`: ACT 模块入口，暴露 `ACE0Modules.act`。
- `tavern/*`: 酒馆 prompt 注入、角色文档、战斗解析、ACT host bridge、结果注入。
- `dashboard/loader.js`: Dashboard iframe 悬浮窗加载。

新增功能时优先放进对应模块，bridge 只保留跨模块基础设施。

## 收口禁区

后续检查时，下面这些不应重新出现：

- `manifest.json` 中的 `globals` URL 回灌。
- `bridge.js` 中的 `pack.globals` 回放逻辑。
- wrapper 或 Dashboard loader 中的旧相对路径 fallback，例如 `resolveUrl('../../index.html?app=game')`。
- 旧完整世界书名 `AceZeroInfo-MVUVer-1.2.4` 或 `AceZeroInfo-MVUVer-2.0-Test`。
- 旧世界书 profile alias `ACE0_WORLDBOOK_PROFILE`。
- 全局 source 标记 `ACE0_FULL_DOC_WORLDBOOK_SOURCE`。
- debug 标记 `__ACE0_APPLIED_FULL_DOC_WORLDBOOK__`。

## 验收命令

```sh
node --check apps/st-bridge/bridge.js
node --check apps/st-bridge/scripts/serve-local.mjs
node --check apps/st-bridge/packs/acezero-main/tavern/worldbook-profile.js
node --check apps/st-bridge/packs/acezero-main/tavern/plugin.js
node --check apps/st-bridge/packs/acezero-main/tavern/character-runtime.js
node apps/st-bridge/packs/acezero-main/scripts/bridge-profile-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/act-result-asset-offer-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/character-doc-mini-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/tavern-frontend-assetdeck-smoke.js
node apps/st-bridge/packs/acezero-main/scripts/mvu-replay-smoke.js
git diff --check
```

快速残留扫描：

```sh
rg -n "pack\\.globals|\"globals\"\\s*:|ACE0_WORLDBOOK_PROFILE|ACE0_FULL_DOC_WORLDBOOK_SOURCE|__ACE0_APPLIED_FULL_DOC_WORLDBOOK__|AceZeroInfo-MVUVer-1\\.2\\.4|AceZeroInfo-MVUVer-2\\.0-Test" apps/st-bridge st/wrappers st/docs -S
```

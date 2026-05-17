# ACE0 本机测试工作区

## 目标

本机测试工作区是一组独立入口文件和本机 bridge profile。它可以测试 ST Bridge、Dashboard、STver 和 ACT_RESULT 的本地构建，不需要先推送到 GitHub Pages。

生产发布仍然走 `main` 的 GitHub Pages workflow。本机测试入口不会自动接管生产入口；只有在酒馆助手脚本和酒馆正则中显式选择 local 脚本/local wrapper 时，才会走 `127.0.0.1:4173`。

## 分支职责

- 生产 wrapper 保持不变：
  - `st/wrappers/STver.html`
  - `st/wrappers/ACT_RESULT.html`
- 本机测试 wrapper 单独放在：
  - `st/wrappers/local/STver.local.html`
  - `st/wrappers/local/ACT_RESULT.local.html`
- 本机 wrapper 直接硬编码 `http://127.0.0.1:4173`，没有 GitHub fallback。
- Full-doc 世界书名统一写在 `apps/st-bridge/packs/acezero-main/tavern/worldbook-profile.js`。
- Bridge 会按 `prod/local` 自动读取该 profile；不要在 README、测试脚本、酒馆助手脚本里重复写死世界书名。

## 启动本机服务

在仓库根目录启动静态服务：

```sh
node apps/st-bridge/scripts/serve-local.mjs --port 4173 --root .
```

服务启动后，下面这些地址应该能在浏览器打开：

```text
http://127.0.0.1:4173/index.html?app=game
http://127.0.0.1:4173/index.html?app=dashboard
http://127.0.0.1:4173/apps/act-result/index.html
http://127.0.0.1:4173/apps/st-bridge/bridge.js
```

本机服务同时兼容 GitHub Pages 子路径别名：

```text
http://127.0.0.1:4173/ace-zero/assets/svg/gaze.svg
http://127.0.0.1:4173/ace-zero/games/texasholdem/texas-holdem/texas-holdem.html
```

这样即使本机 profile、iframe 缓存或旧页面里残留 `/ace-zero/...` 路径，德州 SVG、牌面和游戏资源也不会因为本机根路径不同而 404。

## 酒馆助手脚本

本机测试时粘贴这一份：

```js
window.ST_BRIDGE_PACK = 'acezero-main';
window.ST_BRIDGE_ENV = 'local';
window.ACE0_APP_BASE_URL = 'http://127.0.0.1:4173';
window.ST_BRIDGE_URL = 'http://127.0.0.1:4173/apps/st-bridge/bridge.js';
import 'http://127.0.0.1:4173/apps/st-bridge/bridge.js?env=local&force=1&v=dev';
```

生产环境继续使用 GitHub Pages 版本：

```js
window.ST_BRIDGE_PACK = 'acezero-main';
window.ST_BRIDGE_ENV = 'prod';
window.ST_BRIDGE_URL = 'https://hasheeper.github.io/ace-zero/apps/st-bridge/bridge.js';
import 'https://hasheeper.github.io/ace-zero/apps/st-bridge/bridge.js?env=prod&v=fix-url';
```

临时覆盖世界书时，可以额外加一行：

```js
window.ACE0_FULL_DOC_WORLDBOOK_OVERRIDE = true;
window.ACE0_FULL_DOC_WORLDBOOK_NAME = '你的临时世界书名';
```

正常测试不要加这一行，避免绕过统一 profile。

## 酒馆正则 wrapper

本机测试要把酒馆正则里的 wrapper HTML 换成本机版：

- 游戏面板使用 `st/wrappers/local/STver.local.html`
- ACT_RESULT 使用 `st/wrappers/local/ACT_RESULT.local.html`

生产正则继续使用：

- `st/wrappers/STver.html`
- `st/wrappers/ACT_RESULT.html`

这两套不要混用。断网测试时，只要看到 iframe 还在请求 `hasheeper.github.io`，基本就是正则里还粘着生产 wrapper，或者酒馆助手脚本还在加载生产 bridge。

## 验收检查

运行：

```sh
node apps/st-bridge/packs/acezero-main/scripts/bridge-profile-smoke.js
git diff --check
```

本机 profile 需要满足：

- bridge 脚本 URL 是 `http://127.0.0.1:4173/apps/st-bridge/...`
- game iframe 是 `http://127.0.0.1:4173/index.html?app=game`
- dashboard iframe 是 `http://127.0.0.1:4173/index.html?app=dashboard`
- ACT_RESULT iframe 是 `http://127.0.0.1:4173/apps/act-result/index.html`
- `st/wrappers/local/*.html` 不包含 `hasheeper.github.io`

## 常见问题

### 断网后还是显示 GitHub Pages

检查两处：

1. 酒馆助手脚本是否使用了本机 `import 'http://127.0.0.1:4173/apps/st-bridge/bridge.js?env=local&force=1&v=dev'`。
2. 酒馆正则 wrapper 是否粘贴了 `st/wrappers/local/*.html`，而不是生产 wrapper。

### 页面 404 或 module import 失败

确认本机服务从仓库根目录启动：

```sh
node apps/st-bridge/scripts/serve-local.mjs --port 4173 --root .
```

不要从 `apps/st-bridge` 子目录当 root 启动，否则 `/index.html` 和 `/apps/act-result/index.html` 会找不到。

### ACT_RESULT 在本机模式被压成一条线

优先确认酒馆正则使用的是 `st/wrappers/local/ACT_RESULT.local.html`。该 wrapper 会同时监听 `acezero-act-result-size` 消息，并在同源可读时主动读取 `apps/act-result` 内容高度；如果仍然只有 1px，通常是酒馆正则还贴着旧 wrapper，或浏览器缓存没有刷新。

### 德州 SVG 或牌面在本机模式不加载

先检查服务是否从仓库根目录启动，再直接打开：

```text
http://127.0.0.1:4173/assets/svg/gaze.svg
http://127.0.0.1:4173/assets/deck-of-cards/example/faces/0_1.svg
http://127.0.0.1:4173/ace-zero/assets/svg/gaze.svg
```

前三个都应该返回 SVG。若前两个失败，多半是本机服务 root 不对；若只有第三个失败，说明本机服务不是最新版本。

### 改了代码但酒馆没刷新

把酒馆助手脚本最后加上 `force=1`，并改一个新的 `v` 值，例如：

```js
import 'http://127.0.0.1:4173/apps/st-bridge/bridge.js?env=local&force=1&v=dev2';
```

也可以重开脚本或刷新酒馆页面。

### 端口不是 4173

默认约定是 `4173`。如果必须换端口，需要同步修改：

- 酒馆助手脚本里的 `ACE0_APP_BASE_URL`
- 酒馆助手脚本里的 `ST_BRIDGE_URL`
- `st/wrappers/local/STver.local.html`
- `st/wrappers/local/ACT_RESULT.local.html`

为了减少测试变量，优先继续使用 `4173`。

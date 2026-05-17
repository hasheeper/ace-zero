# ACE0 本机测试工作区

## 目标

`codex/local-test-workspace` 是专门给本机调试用的分支。这个分支可以测试 ST Bridge、Dashboard、STver 和 ACT_RESULT 的本地构建，不需要先推送到 GitHub Pages。

生产发布仍然走 `main`。仓库的 GitHub Pages workflow 从 `main` 发布，所以这个本机测试分支只要不合并回 `main`，就不会影响线上 GitPage 入口。

## 分支职责

- 生产 wrapper 保持不变：
  - `st/wrappers/STver.html`
  - `st/wrappers/ACT_RESULT.html`
- 本机测试 wrapper 单独放在：
  - `st/wrappers/local/STver.local.html`
  - `st/wrappers/local/ACT_RESULT.local.html`
- 本机 wrapper 直接硬编码 `http://127.0.0.1:4173`，没有 GitHub fallback。
- Bridge 本机 profile 使用测试世界书 `AceZeroInfo-MVUVer-2.0-Test`。
- 生产 profile 使用主世界书 `AceZeroInfo-MVUVer-1.2.4`。

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

## 酒馆助手脚本

本机测试时粘贴这一份：

```js
window.ST_BRIDGE_PACK = 'acezero-main';
window.ST_BRIDGE_ENV = 'local';
window.ACE0_APP_BASE_URL = 'http://127.0.0.1:4173';
window.ACE0_FULL_DOC_WORLDBOOK_NAME = 'AceZeroInfo-MVUVer-2.0-Test';
window.ST_BRIDGE_URL = 'http://127.0.0.1:4173/apps/st-bridge/bridge.js';
import 'http://127.0.0.1:4173/apps/st-bridge/bridge.js?env=local&v=dev';
```

生产环境继续使用 GitHub Pages 版本：

```js
window.ST_BRIDGE_PACK = 'acezero-main';
window.ST_BRIDGE_ENV = 'prod';
window.ST_BRIDGE_URL = 'https://hasheeper.github.io/ace-zero/apps/st-bridge/bridge.js';
window.ACE0_FULL_DOC_WORLDBOOK_NAME = 'AceZeroInfo-MVUVer-1.2.4';
import 'https://hasheeper.github.io/ace-zero/apps/st-bridge/bridge.js?env=prod&v=fix-url';
```

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

1. 酒馆助手脚本是否使用了本机 `import 'http://127.0.0.1:4173/apps/st-bridge/bridge.js?env=local&v=dev'`。
2. 酒馆正则 wrapper 是否粘贴了 `st/wrappers/local/*.html`，而不是生产 wrapper。

### 页面 404 或 module import 失败

确认本机服务从仓库根目录启动：

```sh
node apps/st-bridge/scripts/serve-local.mjs --port 4173 --root .
```

不要从 `apps/st-bridge` 子目录当 root 启动，否则 `/index.html` 和 `/apps/act-result/index.html` 会找不到。

### 改了代码但酒馆没刷新

把酒馆助手脚本最后的 `v=dev` 改成新的值，例如：

```js
import 'http://127.0.0.1:4173/apps/st-bridge/bridge.js?env=local&v=dev2';
```

也可以重开脚本或刷新酒馆页面。

### 端口不是 4173

默认约定是 `4173`。如果必须换端口，需要同步修改：

- 酒馆助手脚本里的 `ACE0_APP_BASE_URL`
- 酒馆助手脚本里的 `ST_BRIDGE_URL`
- `st/wrappers/local/STver.local.html`
- `st/wrappers/local/ACT_RESULT.local.html`

为了减少测试变量，优先继续使用 `4173`。

# Frontend Scripts

前端脚本按职责拆成 3 层：

- `ui/`
  - 纯界面渲染与页面交互壳
  - 当前主文件是 `app-shell.js`

- `debug/`
  - 调试面板、调试日志、调试样例
  - 不承载正式主流程

- `runtime/`
  - 浏览器侧运行时接线
  - 包括 browser core adapter、formal runtime factory、legacy fallback factory、runtime bridge、runtime bootstrap

命名约定：

- `browser-*`
  - 明确表示“浏览器侧实现”或“浏览器侧适配层”

- `*-factory`
  - 负责创建 runtime / adapter，而不是直接代表业务页面

- `*-bridge`
  - 只做桥接，不做主流程真相源

- `*-core`
  - 只放共享逻辑，不直接负责页面生命周期

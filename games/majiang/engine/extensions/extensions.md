# Mahjong Extensions Phase 1

当前这层不是完整技能系统，而是正式扩展总线。

## 目标

- 为“发好牌 / 发烂牌 / 敌我透视 / 多局能力延续”预留稳定插桩点
- 区分 truth modifier 与 view modifier
- 不让扩展直接乱改 runtime 内部字段

## 第一批正式 hook

- `beforeRoundSetup`
- `beforeInitialDeal`
- `afterInitialDeal`
- `beforeDraw`
- `afterDraw`
- `modifyReactionCandidates`
- `beforeBuildPlayerView`
- `beforeNextRoundConfigBuild`

## 约束

- truth hook 可以影响发牌、摸牌、动作候选，但不直接篡改已完成局的真相
- view hook 只能影响信息可见性、提示、透视，不改 truth state
- 多个扩展按 `priority` 从高到低执行

## 当前文件

- `extension-hooks.js`
- `extension-context.js`
- `extension-results.js`
- `extension-manager.js`

## 下一阶段

- 把 `beforeInitialDeal / beforeDraw / beforeBuildPlayerView / beforeNextRoundConfigBuild` 接到现有主链
- 做 3 个 demo 扩展：
  - 发好牌
  - 指定摸牌
  - 透视显示

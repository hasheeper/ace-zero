# Mahjong Test Scenario Guide

## 目标

这份文档只保留“怎么新增一个稳定回归样例”的最小说明。当前保留样例与命令以 [TESTS.md](/Users/liuhang/Documents/acezero/majiang/test/TESTS.md) 为准。

单局规则测试目前靠两类能力组合：

- 固定起手 / 固定摸牌 / 固定杠摸
- 启动后自动回放动作，直接快进到测试点

## 1. 固定起手与摸牌

在 `test/game-config.*.json` 里配置：

```json
{
  "engine": {
    "wall": {
      "scripted": {
        "id": "kan-qianggang-case",
        "name": "Kan Qianggang Case",
        "initialHands": [
          ["m1","m1","m1","p2","p3","p4","s2","s3","s4","z1","z1","z2","z2"],
          ["m2","m3","m4","p5","p5","p5","s6","s7","s8","z3","z3","z4","z4"],
          ["m6","m7","m8","p2","p3","p4","s3","s4","s5","z5","z5","z6","z6"],
          ["m9","m9","m9","p7","p8","p9","s1","s1","s1","z7","z7","z4","z4"]
        ],
        "draws": ["m1","p5","z5","m9"],
        "gangDraws": ["z1"]
      }
    }
  }
}
```

说明：

- `initialHands` 是四家起手 13 张
- `draws` 是后续正常摸牌顺序
- `gangDraws` 是岭上摸顺序
- 建议所有正式回归样例都放在 `majiang/test/`

## 2. 启动后快进到测试点

在同一个测试配置里增加：

```json
{
  "testing": {
    "fastForwardActions": [
      { "type": "draw", "payload": { "seat": "bottom" } },
      { "type": "discard", "payload": { "seat": "bottom", "tileCode": "z2" } },
      { "type": "draw", "payload": { "seat": "right" } },
      { "type": "discard", "payload": { "seat": "right", "tileCode": "z4" } }
    ]
  }
}
```

说明：

- 这组动作会在页面启动后自动执行
- 执行完后停在当前测试点
- 推荐优先使用 runtime 原生动作：
  - `draw`
  - `discard`
  - `call`
  - `kan`
  - `pass`
  - `hule`

## 3. 组合用法

推荐流程：

1. 用 `engine.wall.scripted` 固定起手和后续摸牌
2. 用 `testing.fastForwardActions` 把局面推进到目标节点
3. 用 `testing.expectedSnapshot` 断言最终状态

这样可以稳定复现：

- 立直后摸切
- 暗杠
- 加杠
- 加杠抢杠和
- 杠后岭上摸

当前可参考的样例：

- [game-config.qianggang-setup.json](/Users/liuhang/Documents/acezero/majiang/game-config.qianggang-setup.json)
- [game-config.p3-haitei-tsumo.json](/Users/liuhang/Documents/acezero/majiang/test/game-config.p3-haitei-tsumo.json)
- [game-config.p3-houtei-ron.json](/Users/liuhang/Documents/acezero/majiang/test/game-config.p3-houtei-ron.json)
- [game-config.p3-tenhou.json](/Users/liuhang/Documents/acezero/majiang/test/game-config.p3-tenhou.json)
- [game-config.p3-chiihou.json](/Users/liuhang/Documents/acezero/majiang/test/game-config.p3-chiihou.json)
- [game-config.p3-nine-kinds.json](/Users/liuhang/Documents/acezero/majiang/test/game-config.p3-nine-kinds.json)
- [game-config.p3-exhaustive-draw.json](/Users/liuhang/Documents/acezero/majiang/test/game-config.p3-exhaustive-draw.json)
- [game-config.p4-furiten-discard.json](/Users/liuhang/Documents/acezero/majiang/test/game-config.p4-furiten-discard.json)
- [game-config.p4-furiten-pass-ron.json](/Users/liuhang/Documents/acezero/majiang/test/game-config.p4-furiten-pass-ron.json)
- [game-config.p4-furiten-clear-after-discard.json](/Users/liuhang/Documents/acezero/majiang/test/game-config.p4-furiten-clear-after-discard.json)
- [game-config.p4-furiten-riichi-lock.json](/Users/liuhang/Documents/acezero/majiang/test/game-config.p4-furiten-riichi-lock.json)

如果你想看“碰已经完成，但还没真正加杠”的中间状态，可以用：

- `?config=/majiang/game-config.qianggang-setup.json`

## 4. 本地验证脚本

当前主要使用两份脚本：

- [validate-p3-scenarios.js](/Users/liuhang/Documents/acezero/majiang/scripts/validate-p3-scenarios.js)
- [validate-furiten-scenarios.js](/Users/liuhang/Documents/acezero/majiang/scripts/validate-furiten-scenarios.js)

执行方式见 [TESTS.md](/Users/liuhang/Documents/acezero/majiang/test/TESTS.md)。

## 5. 当前边界

当前这套测试能力是为“单局规则点复现”准备的，不是完整回放系统。

适合：

- 定位规则 bug
- 复现极端单局 case
- 给未来自动化测试准备固定样本

暂不负责：

- 多局推进
- 完整牌谱回放
- 跨局状态恢复

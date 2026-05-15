/**
 * Poker AI split module: StateModels.
 */
(function(global) {
  'use strict';

  var modules = global.PokerAIModules || (global.PokerAIModules = {});
  var register = modules.register || function(moduleName, value) {
    modules[moduleName] = value;
    return value;
  };

  // ========== 行为状态机 (Behavior FSM) ==========
  // 驱动效用权重和温度的动态变化
  // 状态由局中事件自动触发转移，不同难度有不同的状态集和衰减速度

  const FSM_STATES = {
    CAUTIOUS: 'cautious',   // 谨慎：基准状态
    HUNTING:  'hunting',    // 狩猎：赢了大锅后激进
    TILTED:   'tilted',     // 上头：被 Bad Beat 后混乱
    CORNERED: 'cornered'    // 被逼：筹码见底，孤注一掷
  };

  // 状态对效用权重和温度的修正
  const FSM_MODIFIERS = {
    cautious: { aggroDelta: 0,     tempDelta: 0,    label: '谨慎' },
    hunting:  { aggroDelta: 0.15,  tempDelta: -0.1, label: '狩猎' },
    tilted:   { aggroDelta: 0.35,  tempDelta: 0.8,  label: '上头' },
    cornered: { aggroDelta: 0.25,  tempDelta: 0.3,  label: '被逼' }
  };

  // 上头持续手数（按难度）
  const TILT_DURATION = {
    noob:    5,
    regular: 3,
    pro:     1,
    boss:    0   // boss 不会上头（用阶段脚本替代）
  };

  // 各难度可用的状态集
  const DIFFICULTY_STATES = {
    noob:    [FSM_STATES.CAUTIOUS, FSM_STATES.TILTED],                                          // 只有 2 态
    regular: [FSM_STATES.CAUTIOUS, FSM_STATES.HUNTING, FSM_STATES.TILTED, FSM_STATES.CORNERED], // 完整 4 态
    pro:     [FSM_STATES.CAUTIOUS, FSM_STATES.HUNTING, FSM_STATES.TILTED, FSM_STATES.CORNERED], // 完整 4 态
    boss:    [FSM_STATES.CAUTIOUS, FSM_STATES.HUNTING, FSM_STATES.CORNERED]                     // 3 态，无 tilt
  };

  class BehaviorFSM {
    /**
     * @param {string} difficulty - noob/regular/pro/boss
     * @param {number} initialChips - 起始筹码（用于判断 CORNERED）
     */
    constructor(difficulty, initialChips) {
      this.difficulty = difficulty || 'regular';
      this.state = FSM_STATES.CAUTIOUS;
      this.initialChips = initialChips || 1000;
      this.tiltCounter = 0;       // 上头剩余手数
      this.foldStreak = 0;        // 连续弃牌计数
      this.availableStates = DIFFICULTY_STATES[this.difficulty] || DIFFICULTY_STATES.regular;
    }

    /**
     * 获取当前状态的修正值
     * @returns {{ aggroDelta: number, tempDelta: number, state: string, label: string }}
     */
    getModifiers() {
      const mod = FSM_MODIFIERS[this.state] || FSM_MODIFIERS.cautious;
      return {
        aggroDelta: mod.aggroDelta,
        tempDelta: mod.tempDelta,
        state: this.state,
        label: mod.label
      };
    }

    /**
     * 手牌结束后触发事件，驱动状态转移
     * @param {string} event - 事件类型
     * @param {object} data  - 事件数据
     *
     * 事件类型:
     *   'win_big'    — 赢了大锅 (pot > 10×BB)        data: { pot, bb }
     *   'bad_beat'   — 被 Bad Beat (翻前领先但输)     data: {}
     *   'win_normal' — 普通赢                         data: {}
     *   'lose'       — 输了                           data: {}
     *   'fold'       — 弃牌                           data: {}
     *   'chip_check' — 每手结束检查筹码               data: { chips }
     */
    onEvent(event, data) {
      const prev = this.state;
      data = data || {};

      // 1. 上头衰减（每手 -1）
      if (this.tiltCounter > 0) {
        this.tiltCounter--;
        if (this.tiltCounter <= 0 && this.state === FSM_STATES.TILTED) {
          this.state = FSM_STATES.CAUTIOUS;
        }
      }

      // 2. 事件驱动转移
      switch (event) {
        case 'win_big':
          if (this._canEnter(FSM_STATES.HUNTING)) {
            this.state = FSM_STATES.HUNTING;
            this.foldStreak = 0;
          }
          break;

        case 'bad_beat':
          if (this._canEnter(FSM_STATES.TILTED)) {
            this.state = FSM_STATES.TILTED;
            this.tiltCounter = TILT_DURATION[this.difficulty] || 3;
            this.foldStreak = 0;
          }
          break;

        case 'win_normal':
          this.foldStreak = 0;
          // 赢了就从 CORNERED 恢复
          if (this.state === FSM_STATES.CORNERED) {
            this.state = FSM_STATES.CAUTIOUS;
          }
          // 赢了就从 HUNTING 回到 CAUTIOUS（一次性）
          // 不做：让 HUNTING 持续到下次输
          break;

        case 'lose':
          this.foldStreak = 0;
          // 输了就从 HUNTING 回到 CAUTIOUS
          if (this.state === FSM_STATES.HUNTING) {
            this.state = FSM_STATES.CAUTIOUS;
          }
          break;

        case 'fold':
          this.foldStreak++;
          // 连续弃牌 3 手 → 从 CAUTIOUS 切到 HUNTING（不耐烦）
          if (this.foldStreak >= 3 && this.state === FSM_STATES.CAUTIOUS) {
            if (this._canEnter(FSM_STATES.HUNTING)) {
              this.state = FSM_STATES.HUNTING;
              this.foldStreak = 0;
            }
          }
          break;

        case 'chip_check':
          // 筹码 < 30% 起始值 → CORNERED
          if (data.chips != null && data.chips < this.initialChips * 0.3) {
            if (this._canEnter(FSM_STATES.CORNERED) && this.state !== FSM_STATES.TILTED) {
              this.state = FSM_STATES.CORNERED;
            }
          }
          // 筹码恢复 > 50% → 脱离 CORNERED
          if (data.chips != null && data.chips >= this.initialChips * 0.5) {
            if (this.state === FSM_STATES.CORNERED) {
              this.state = FSM_STATES.CAUTIOUS;
            }
          }
          break;
      }

      // 3. 日志
      if (this.state !== prev) {
        console.log('[FSM] ' + prev + ' → ' + this.state +
          ' (event=' + event + ' diff=' + this.difficulty + ')');
      }
    }

    /**
     * 检查该难度是否可以进入某状态
     */
    _canEnter(state) {
      return this.availableStates.indexOf(state) !== -1;
    }

    /**
     * 重置（新一局）
     */
    reset(initialChips) {
      this.state = FSM_STATES.CAUTIOUS;
      this.tiltCounter = 0;
      this.foldStreak = 0;
      if (initialChips != null) this.initialChips = initialChips;
    }
  }

  // ========== Boss 阶段脚本 (Phase 6) ==========
  // Boss 不用通用 FSM，而是按筹码阶段执行预设脚本
  // 三阶段：从容(>70%) → 认真(30-70%) → 狂暴(<30%)

  const BOSS_PHASES = {
    COMPOSED: 'composed',   // 从容：像 pro 一样精准
    SERIOUS:  'serious',    // 认真：加大魔运投入
    ENRAGED:  'enraged'     // 狂暴：全力输出
  };

  const BOSS_PHASE_MODIFIERS = {
    composed: { aggroDelta: 0,    tempDelta: 0,    magicDelta: 0,    handFloor: 45, label: '从容' },
    serious:  { aggroDelta: 0.15, tempDelta: -0.05, magicDelta: 0.10, handFloor: 50, label: '认真' },
    enraged:  { aggroDelta: 0.30, tempDelta: -0.15, magicDelta: 0.20, handFloor: 60, label: '狂暴' }
  };

  class BossScript {
    constructor(initialChips) {
      this.initialChips = initialChips || 1000;
      this.phase = BOSS_PHASES.COMPOSED;
      this.weaknessTiltCounter = 0; // 弱点触发后的 tilt 手数
    }

    /**
     * 根据当前筹码更新阶段
     * @param {number} chips - 当前筹码
     */
    updatePhase(chips) {
      const prev = this.phase;
      const ratio = chips / Math.max(1, this.initialChips);

      if (ratio > 0.70) {
        this.phase = BOSS_PHASES.COMPOSED;
      } else if (ratio > 0.30) {
        this.phase = BOSS_PHASES.SERIOUS;
      } else {
        this.phase = BOSS_PHASES.ENRAGED;
      }

      // 弱点 tilt 衰减
      if (this.weaknessTiltCounter > 0) {
        this.weaknessTiltCounter--;
      }

      if (this.phase !== prev) {
        console.log('[BossScript] ' + prev + ' → ' + this.phase +
          ' (chips=' + chips + ' ratio=' + (ratio * 100).toFixed(0) + '%)');
      }
    }

    /**
     * 弱点触发：Boss 被特定技能反制后陷入动摇
     * @param {number} duration - 动摇持续手数
     */
    triggerWeakness(duration) {
      this.weaknessTiltCounter = duration || 2;
      console.log('[BossScript] WEAKNESS TRIGGERED! tilt for ' + this.weaknessTiltCounter + ' hands');
    }

    /**
     * 获取当前阶段的修正值
     * 弱点触发时覆盖为 tilt 模式
     */
    getModifiers() {
      // 弱点 tilt 覆盖一切
      if (this.weaknessTiltCounter > 0) {
        return {
          aggroDelta: 0.30,
          tempDelta: 1.5,       // 温度暴涨 → 随机
          magicDelta: -0.20,    // 魔运权重暴跌
          handFloor: 30,        // 手牌保底降低
          phase: 'weakness',
          label: '动摇'
        };
      }

      const mod = BOSS_PHASE_MODIFIERS[this.phase] || BOSS_PHASE_MODIFIERS.composed;
      return {
        aggroDelta: mod.aggroDelta,
        tempDelta: mod.tempDelta,
        magicDelta: mod.magicDelta,
        handFloor: mod.handFloor,
        phase: this.phase,
        label: mod.label
      };
    }

    reset(initialChips) {
      this.phase = BOSS_PHASES.COMPOSED;
      this.weaknessTiltCounter = 0;
      if (initialChips != null) this.initialChips = initialChips;
    }
  }


  register('StateModels', {
    FSM_STATES: FSM_STATES,
    FSM_MODIFIERS: FSM_MODIFIERS,
    TILT_DURATION: TILT_DURATION,
    DIFFICULTY_STATES: DIFFICULTY_STATES,
    BehaviorFSM: BehaviorFSM,
    BOSS_PHASES: BOSS_PHASES,
    BOSS_PHASE_MODIFIERS: BOSS_PHASE_MODIFIERS,
    BossScript: BossScript
  });
})(typeof window !== 'undefined' ? window : global);

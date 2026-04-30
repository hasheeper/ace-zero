/**
 * Combat Formula — 战斗公式系统
 * 《零之王牌》新力量对抗公式
 *
 * 核心公式：
 *   EffectivePower = SkillLevel × 10 × (1 + 主手属性/100) × 属性克制倍率
 *
 * 对抗流程：
 *   1. 计算每个 force 的 raw power（含属性加成 + 克制倍率）
 *   2. 同类型力量互相抵消（fortune vs fortune, curse vs curse）
 *   3. 主动压制被动（等级差额外削弱）
 *   4. 命运之锚 / 概率死角 被动效果
 *   5. Void 减伤（前台 Kazu 时，敌方所有效果 ÷ voidDivisor）
 *
 * 依赖：
 *   - AttributeSystem（属性面板 + 克制关系）
 *   - SwitchSystem（前台/后台状态 + 属性路由）
 *   - TraitSystem（特质被动加成）
 *
 * 本模块不直接修改 monte-of-zero.js，而是提供一个
 * enhanceForces(forces) 方法，在 _resolveForceOpposition 之前调用，
 * 将属性加成和克制倍率注入到每个 force 的 power 中。
 */

// ========== CombatFormula 类 ==========

export class CombatFormula {
    /**
     * @param {object} opts
     * @param {AttributeSystem} opts.attributeSystem
     * @param {SwitchSystem}    opts.switchSystem
     */
    constructor(opts) {
      opts = opts || {};
      this.attributeSystem = opts.attributeSystem || null;
      this.switchSystem = opts.switchSystem || null;
      this.traitSystem = opts.traitSystem || null;
      this.skillSystem = opts.skillSystem || null;
      this.heroId = opts.heroId != null ? opts.heroId : 0;
      this.onTraitManaGain = typeof opts.onTraitManaGain === 'function' ? opts.onTraitManaGain : null;
      // gameContext 由外部每轮注入，供特质判断筹码等动态条件
      this.gameContext = null;
      this._phaseStateKey = null;
      this._phaseTraitState = {};
    }

    _isPlayerAvailable(player) {
      return !!(player && !player.folded && player.isActive !== false);
    }

    _getPlayerBaselineChips(player) {
      if (!player) return 0;
      return player.initialChips || player.startingChips || player.baseChips || ((player.chips || 0) + (player.totalBet || 0));
    }

    _syncPhaseTraitState() {
      const phaseKey = (this.gameContext && this.gameContext.phase) || 'unknown';
      if (this._phaseStateKey !== phaseKey) {
        this._phaseStateKey = phaseKey;
        this._phaseTraitState = {};
      }
    }

    _hasPhaseTrigger(ownerId, triggerKey) {
      const ownerState = this._phaseTraitState[ownerId];
      return !!(ownerState && ownerState[triggerKey]);
    }

    _markPhaseTrigger(ownerId, triggerKey) {
      if (!this._phaseTraitState[ownerId]) this._phaseTraitState[ownerId] = {};
      this._phaseTraitState[ownerId][triggerKey] = true;
    }

    _targetHasStatusMark(targetId, markKey) {
      if (targetId == null || !markKey) return false;
      if (this.skillSystem && typeof this.skillSystem.hasStatusMark === 'function') {
        return this.skillSystem.hasStatusMark(targetId, markKey);
      }
      return false;
    }

    _getAssetLedgerValue(ownerId, key) {
      if (ownerId == null || !key || !this.skillSystem || !this.skillSystem.assetLedger || typeof this.skillSystem.assetLedger.getValue !== 'function') {
        return 0;
      }
      return Number(this.skillSystem.assetLedger.getValue(ownerId, key) || 0);
    }

    _shouldKeepTraitInjectedBasePower(force) {
      if (!force || force.source !== 'trait' || force._traitInjected !== true) return false;
      if (typeof force._traitTag !== 'string') return false;
      return force._traitTag.indexOf('four_leaf_clover(常驻P') === 0 ||
        force._traitTag.indexOf('obsessive_love(') === 0;
    }

    /**
     * 增强 forces 列表：为每个 force 注入属性加成和克制倍率
     * 在 _resolveForceOpposition 之前调用
     *
     * @param {Array} forces - 原始 forces 列表
     * @param {object} context - { players } 用于确定敌方属性
     * @returns {Array} 增强后的 forces（修改了 power 值）
     */
    enhanceForces(forces, context) {
      if (!this.attributeSystem || !this.switchSystem) {
        return forces; // 无属性系统时，保持原始行为
      }

      this._syncPhaseTraitState();

      this._martyrdomStacks = {};

      // 人情账簿 fortune 命中累积（跨轮，不在这里重置）
      if (!this._debtCount) this._debtCount = {};

      const enhanced = forces.map(f => ({ ...f }));

      for (const force of enhanced) {
        if (this._shouldKeepTraitInjectedBasePower(force)) {
          force.power = Math.round(force.power * 10) / 10;
          force._attrBonus = 1;
          force._counterMult = 1;
          force._primaryAttr = null;
          continue;
        }

        const enhancement = this._calculateEnhancement(force, enhanced, context);
        force.power = Math.round(force.power * enhancement.totalMultiplier * 10) / 10;
        // 附加元数据供 UI 和日志使用
        force._attrBonus = enhancement.attrBonus;
        force._counterMult = enhancement.counterMult;
        force._primaryAttr = enhancement.primaryAttr;
      }

      // 特质被动力注入（obsessive_love 等产生的常驻 force）
      this._injectTraitForces(enhanced);

      // 为 trait 注入的新 force 补算属性加成与克制倍率
      for (const force of enhanced) {
        if (force._attrBonus !== undefined) continue;
        if (this._shouldKeepTraitInjectedBasePower(force)) {
          force.power = Math.round(force.power * 10) / 10;
          force._attrBonus = 1;
          force._counterMult = 1;
          force._primaryAttr = null;
          continue;
        }
        const enhancement = this._calculateEnhancement(force, enhanced, context);
        force.power = Math.round(force.power * enhancement.totalMultiplier * 10) / 10;
        force._attrBonus = enhancement.attrBonus;
        force._counterMult = enhancement.counterMult;
        force._primaryAttr = enhancement.primaryAttr;
      }

      // 特质加成（在属性加成之后叠加）
      this._applyTraitBonuses(enhanced, context);

      return enhanced;
    }

    /**
     * 应用 Void 减伤到敌方 forces
     * 在力量对抗结算之后、最终计算命运分之前调用
     *
     * @param {Array} resolvedForces - 对抗结算后的 forces
     * @returns {Array} 应用 Void 减伤后的 forces
     */
    applyVoidReduction(resolvedForces) {
      if (!this.attributeSystem || !this.switchSystem) {
        return resolvedForces;
      }

      const voidDivisor = this.switchSystem.getVoidDivisor();
      if (voidDivisor <= 1.0) return resolvedForces; // 无 Void 属性

      const playerSide = this.switchSystem.rinoId;

      for (const f of resolvedForces) {
        // Void 只减伤敌方对我方的效果
        if (f.ownerId === playerSide) continue; // 己方 force 不受影响
        if (f.type === 'null_field' || f.type === 'void_shield' || f.type === 'reversal') continue; // meta 力不受影响

        // 敌方 fortune（帮敌人赢）和 curse（害我方）都被削弱
        if (f.effectivePower > 0) {
          let actualDivisor = voidDivisor;
          // death_ledger 穿透：诅咒无视部分 Void 减伤
          if (f._penetration && f.type === 'curse') {
            // 穿透 25% 意味着减伤效果降低 25%
            actualDivisor = 1 + (actualDivisor - 1) * (1 - f._penetration);
          }
          f.effectivePower = Math.round((f.effectivePower / actualDivisor) * 10) / 10;
          f._voidReduced = true;
          f._voidDivisor = actualDivisor;
        }
      }

      return resolvedForces;
    }

    /**
     * 计算单个 force 的增强倍率
     * @private
     */
    _calculateEnhancement(force, allForces, context) {
      const result = {
        attrBonus: 1.0,
        counterMult: 1.0,
        totalMultiplier: 1.0,
        primaryAttr: null
      };

      // 1. 确定 force 所属属性
      const forceAttr = this.attributeSystem.getAttributeForEffect(force.type);
      result.primaryAttr = forceAttr;

      // 2. 属性加成：来自 force 拥有者的属性面板
      const ownerAttrs = this.attributeSystem.getAttributes(force.ownerId);
      const attrValue = ownerAttrs[forceAttr] || 0;
      result.attrBonus = this.attributeSystem.getAttributeBonus(attrValue);

      // 3. 克制倍率：需要找到对抗目标的主属性
      const opponentAttr = this._getOpponentPrimaryAttr(force, allForces);
      if (opponentAttr) {
        result.counterMult = this.attributeSystem.getCounterMultiplier(forceAttr, opponentAttr);
      }

      // 4. 总倍率
      result.totalMultiplier = result.attrBonus * result.counterMult;

      return result;
    }

    /**
     * 推断对手的主属性
     * 规则：找到与此 force 对抗的敌方 forces 中最强的那个的属性
     * @private
     */
    _getOpponentPrimaryAttr(force, allForces) {
      const hid = this.heroId != null ? this.heroId : 0;
      const isPlayerForce = (force.ownerId === hid || force.ownerId === -2);

      // 找到敌方的同类型 forces
      const opponentForces = allForces.filter(f => {
        const isOpponentPlayer = (f.ownerId === hid || f.ownerId === -2);
        // 不同阵营
        if (isPlayerForce === isOpponentPlayer) return false;
        // 同类型对抗（fortune vs fortune, curse vs curse）
        // 或者 curse 对 fortune（诅咒对抗幸运）
        return f.type === force.type ||
               (force.type === 'fortune' && f.type === 'curse') ||
               (force.type === 'curse' && f.type === 'fortune');
      });

      if (opponentForces.length === 0) return null;

      // 取最强敌方 force 的属性
      const strongest = opponentForces.reduce((a, b) => (b.power > a.power ? b : a));
      return this.attributeSystem.getAttributeForEffect(strongest.type);
    }

    // ========== 特质加成 ==========

    /**
     * 应用特质被动加成到 forces
     * 在属性加成之后调用，叠加到 power 上
     * @private
     */
    _applyTraitBonuses(forces, context) {
      if (!this.traitSystem) return;

      for (const f of forces) {
        if (this._shouldKeepTraitInjectedBasePower(f)) continue;
        let traitMult = 1.0;
        let traitTag = null;

        // --- crimson_crown（绯红王冠）：拥有者的 fortune +25%（通用） ---
        if (f.type === 'fortune') {
          const cc = this.traitSystem.hasEffect(f.ownerId, 'fortune_amp_curse_vuln');
          if (cc.has) {
            traitMult *= (1 + cc.value.fortuneBonus);
            traitTag = 'crimson_crown';
          }
        }

        // --- obsessive_love（执念之爱）：无论顺逆风，fortune +20%（通用） ---
        if (f.type === 'fortune') {
          const ol = this.traitSystem.hasEffect(f.ownerId, 'desperate_devotion');
          if (ol.has && ol.value.fortuneBonus) {
            traitMult *= (1 + ol.value.fortuneBonus);
            traitTag = (traitTag ? traitTag + '+' : '') + 'obsessive_love';
          }
        }

        // --- martyr_frame（殉道体质）：按上一街名义厄运分层放大本街 fortune ---
        if (f.type === 'fortune') {
          const mf = this.traitSystem.hasEffect(f.ownerId, 'eulalia_martyr_frame');
          if (mf.has && !f._eulaliaMartyrSnapshot) {
            const burdenPerLayer = Math.max(1, Number(mf.value.burdenPerLayer || 10));
            const nominalBurden = Math.max(0, this._getAssetLedgerValue(f.ownerId, 'eulalia_nominal_burden'));
            const storedLayers = Math.max(0, this._getAssetLedgerValue(f.ownerId, 'eulalia_burden_layers'));
            const layers = storedLayers > 0 ? storedLayers : Math.floor(nominalBurden / burdenPerLayer);
            const layerBonus = Math.max(0, Number(mf.value.fortuneBonusPerLayer || 0));
            if (layers > 0 && layerBonus > 0) {
              traitMult *= (1 + layers * layerBonus);
              traitTag = (traitTag ? traitTag + '+' : '') + 'martyr_frame(x' + layers + ')';
            }
          }
        }

        // --- binding_protocol（拘束协议）：power -10%（任何拥有此特质的角色） ---
        {
          const lp = this.traitSystem.hasEffect(f.ownerId, 'mana_efficiency');
          if (lp.has && lp.value.powerMult) {
            traitMult *= lp.value.powerMult;
            traitTag = (traitTag ? traitTag + '+' : '') + 'binding_protocol';
          }
        }

        // --- null_armor（虚无铠装）：拥有者的 fortune -20%（通用） ---
        if (f.type === 'fortune') {
          const na = this.traitSystem.hasEffect(f.ownerId, 'null_absorption');
          if (na.has && na.value.fortunePenalty) {
            traitMult *= (1 - na.value.fortunePenalty);
            traitTag = (traitTag ? traitTag + '+' : '') + 'null_armor(fortune↓)';
          }
        }

        // --- steady_hand（不动心）：拥有者受到的 curse -10%（通用） ---
        if (f.type === 'curse') {
          // 检查诅咒目标是否拥有 steady_hand
          const curseTargetId = f.targetId != null ? f.targetId : this.heroId;
          if (f.ownerId !== curseTargetId) {
            const sh = this.traitSystem.hasEffect(curseTargetId, 'calm_support');
            if (sh.has && sh.value.curseReduction) {
              traitMult *= (1 - sh.value.curseReduction);
              traitTag = (traitTag ? traitTag + '+' : '') + 'steady_hand';
            }
          }
        }

        // --- steady_hand（不动心）：拥有者的 fortune -15%（通用） ---
        if (f.type === 'fortune') {
          const shF = this.traitSystem.hasEffect(f.ownerId, 'calm_support');
          if (shF.has && shF.value.fortunePenalty) {
            traitMult *= (1 - shF.value.fortunePenalty);
            traitTag = (traitTag ? traitTag + '+' : '') + 'steady_hand(fortune↓)';
          }
        }

        // --- crimson_crown 反面：拥有者受到的 curse +15%（通用） ---
        if (f.type === 'curse') {
          const curseTargetId2 = f.targetId != null ? f.targetId : this.heroId;
          if (f.ownerId !== curseTargetId2) {
            const ccVuln = this.traitSystem.hasEffect(curseTargetId2, 'fortune_amp_curse_vuln');
            if (ccVuln.has && ccVuln.value.curseVuln) {
              traitMult *= (1 + ccVuln.value.curseVuln);
              traitTag = (traitTag ? traitTag + '+' : '') + 'crimson_vuln';
            }
          }
        }

        // --- death_ledger：拥有者的 curse 获得穿透标记（任何拥有此特质的角色） ---
        if (f.type === 'curse') {
          const dl = this.traitSystem.hasEffect(f.ownerId, 'curse_penetration');
          if (dl.has) {
            var basePen = dl.value.value || 0.15;
            var markedBonus = dl.value.markedBonus || 0;
            var curseTargetId3 = f.targetId != null ? f.targetId : this.heroId;
            if (markedBonus > 0 && this._targetHasStatusMark(curseTargetId3, 'cooler_mark')) {
              basePen += markedBonus;
              traitTag = (traitTag ? traitTag + '+' : '') + 'death_ledger(marked)';
            } else {
              traitTag = (traitTag ? traitTag + '+' : '') + 'death_ledger';
            }
            f._penetration = basePen;
          }
        }

        // --- four_leaf_clover（四叶草）：顺风走背字，逆风自动捡运（通用） ---
        if (f.type === 'fortune' && this.gameContext) {
          const flc = this.traitSystem.hasEffect(f.ownerId, 'underdog_fortune');
          if (flc.has) {
            const isSelfInjectedCloverFortune = f.source === 'trait' &&
              f._traitInjected === true &&
              typeof f._traitTag === 'string' &&
              f._traitTag.indexOf('four_leaf_clover(') === 0;
            if (isSelfInjectedCloverFortune) continue;
            const ownerP = this.gameContext.players ? this.gameContext.players.find(p => p.id === f.ownerId) : null;
            if (this._isPlayerAvailable(ownerP)) {
              const baselineChips = this._getPlayerBaselineChips(ownerP);
              if (baselineChips > 0) {
                const chipRatio = ownerP.chips / baselineChips;
                if (chipRatio <= (flc.value.lowThreshold || 0.5)) {
                  traitMult *= (1 + (flc.value.lowBonus || 0.3));
                  traitTag = (traitTag ? traitTag + '+' : '') + 'four_leaf_clover(绝境+30%)';
                } else if (chipRatio < (flc.value.midThreshold || 1.0)) {
                  traitMult *= (1 + (flc.value.midBonus || 0.15));
                  traitTag = (traitTag ? traitTag + '+' : '') + 'four_leaf_clover(逆风+15%)';
                } else if (chipRatio > (flc.value.highThreshold || 1.5)) {
                  traitMult *= (1 - (flc.value.highFortunePenalty || 0.15));
                  traitTag = (traitTag ? traitTag + '+' : '') + 'four_leaf_clover(顺风-15%)';
                }
              }
            }
          }
        }

        if (f.type === 'curse') {
          const curseTargetId4 = f.targetId != null ? f.targetId : this.heroId;
          if (f.ownerId !== curseTargetId4 && this.gameContext) {
            const flcVuln = this.traitSystem.hasEffect(curseTargetId4, 'underdog_fortune');
            if (flcVuln.has) {
              const targetP = this.gameContext.players ? this.gameContext.players.find(p => p.id === curseTargetId4) : null;
              if (this._isPlayerAvailable(targetP)) {
                const baselineTargetChips = this._getPlayerBaselineChips(targetP);
                if (baselineTargetChips > 0) {
                  const targetRatio = targetP.chips / baselineTargetChips;
                  if (targetRatio > (flcVuln.value.highThreshold || 1.5)) {
                    traitMult *= (1 + (flcVuln.value.highCurseVuln || 0.15));
                    traitTag = (traitTag ? traitTag + '+' : '') + 'four_leaf_clover(顺风curse↑15%)';
                  }
                }
              }
            }
          }
        }

        // 应用特质倍率
        if (traitMult !== 1.0 && f.power > 0) {
          f.power = Math.round(f.power * traitMult * 10) / 10;
          f._traitMult = traitMult;
          f._traitTag = traitTag;
        }

        // --- null_armor（虚无铠装）二层：每街共限1次，吸收 curse / fortune 并回蓝 ---
        {
          const nullTargetId = (f.type === 'fortune')
            ? f.ownerId
            : (f.targetId != null ? f.targetId : this.heroId);
          const isHostileCurse = f.type === 'curse' && f.ownerId !== nullTargetId;
          const isSelfFortune = f.type === 'fortune' && f.ownerId === nullTargetId;
          const naAbsorb = this.traitSystem.hasEffect(nullTargetId, 'null_absorption');

          if (naAbsorb.has && !this._hasPhaseTrigger(nullTargetId, 'null_armor_shared') &&
              (isHostileCurse || isSelfFortune) && f.power > 0) {
            const absorbRate = naAbsorb.value.absorbRate || 0;
            const manaGainRate = naAbsorb.value.manaGainRate || 0;
            const absorbedPower = Math.round(f.power * absorbRate * 10) / 10;

            if (absorbedPower > 0) {
              f.power = Math.round(Math.max(0, f.power - absorbedPower) * 10) / 10;
              f._nullArmorAbsorbed = absorbedPower;
              f._traitTag = (f._traitTag ? f._traitTag + '+' : '') + 'null_armor(absorb)';
              this._markPhaseTrigger(nullTargetId, 'null_armor_shared');

              const manaGain = Math.ceil(absorbedPower * manaGainRate);
              if (manaGain > 0 && this.onTraitManaGain) {
                this.onTraitManaGain(nullTargetId, manaGain, {
                  trait: 'null_armor',
                  phase: this._phaseStateKey,
                  forceType: f.type,
                  absorbedPower: absorbedPower
                });
                f._nullArmorManaGain = manaGain;
              }
            }
          }
        }
      }
    }

    /**
     * 注入特质产生的被动 force（不依赖技能激活）
     * obsessive_love: 顺风每街一次 fortune P=15，逆风每街一次 curse P=15 指向自身
     * @private
     */
    _injectTraitForces(forces) {
      if (!this.traitSystem || !this.gameContext) return;

      // --- obsessive_love 被动 fortune/curse（通用：所有拥有该特质的玩家） ---
      if (this.gameContext && this.gameContext.players) {
        for (const p of this.gameContext.players) {
          if (!this._isPlayerAvailable(p)) continue;
          const ol = this.traitSystem.hasEffect(p.id, 'desperate_devotion');
          if (!ol.has) continue;
          if (this._hasPhaseTrigger(p.id, 'obsessive_love')) continue;
          const ownerChips = this._getPlayerChips(p.id);
          const maxOppChips = this._getMaxOpponentChipsFor(p.id);

          if (ownerChips > maxOppChips && ol.value.passiveAhead) {
            forces.push({
              ownerId: p.id,
              ownerName: '执念之爱',
              type: 'fortune',
              power: ol.value.passiveAhead,
              effectivePower: ol.value.passiveAhead,
              tier: 99,
              activation: 'passive',
              source: 'trait',
              _traitTag: 'obsessive_love(顺风)',
              _traitInjected: true
            });
            this._markPhaseTrigger(p.id, 'obsessive_love');
          } else if (ownerChips < maxOppChips && ol.value.passiveBehind) {
            forces.push({
              ownerId: p.id,
              ownerName: '执念反噬',
              type: 'curse',
              power: Math.abs(ol.value.passiveBehind),
              effectivePower: Math.abs(ol.value.passiveBehind),
              targetId: p.id,
              tier: 99,
              activation: 'passive',
              source: 'trait',
              _traitTag: 'obsessive_love(逆风)',
              _traitInjected: true
            });
            this._markPhaseTrigger(p.id, 'obsessive_love');
          }
        }
      }

      // --- four_leaf_clover（四叶草）：POPPY — 逆风常驻固定幸运（通用） ---
      if (this.gameContext && this.gameContext.players) {
        for (const p of this.gameContext.players) {
          if (!this._isPlayerAvailable(p)) continue;
          const flc = this.traitSystem.hasEffect(p.id, 'underdog_fortune');
          if (!flc.has) continue;

          const baselineChips = this._getPlayerBaselineChips(p);
          if (baselineChips <= 0) continue;
          const chipRatio = p.chips / baselineChips;

          let fixedFortune = 0;
          if (chipRatio <= (flc.value.lowThreshold || 0.5)) {
            fixedFortune = flc.value.lowFixedFortune || 10;
          } else if (chipRatio < (flc.value.midThreshold || 1.0)) {
            fixedFortune = flc.value.midFixedFortune || 5;
          }

          if (fixedFortune > 0) {
            forces.push({
              ownerId: p.id,
              ownerName: '四叶草',
              type: 'fortune',
              power: fixedFortune,
              effectivePower: fixedFortune,
              tier: 99,
              activation: 'passive',
              source: 'trait',
              _traitTag: 'four_leaf_clover(常驻P' + fixedFortune + ')',
              _traitInjected: true
            });
          }
        }
      }
    }

    /**
     * 获取第一个非 hero 的活跃玩家ID
     * @private
     */
    _getFirstOpponentId() {
      return this._getFirstOpponentIdFor(this.heroId);
    }

    /**
     * 获取指定玩家的筹码
     * @private
     */
    _getPlayerChips(playerId) {
      if (!this.gameContext || !this.gameContext.players) return 0;
      const p = this.gameContext.players.find(pp => pp.id === playerId);
      return p ? (p.chips || 0) : 0;
    }

    /**
     * 获取指定玩家的对手中最高筹码
     * @private
     */
    _getMaxOpponentChipsFor(playerId) {
      if (!this.gameContext || !this.gameContext.players) return 0;
      let max = 0;
      for (const p of this.gameContext.players) {
        if (p.id === playerId) continue;
        if (!this._isPlayerAvailable(p)) continue;
        if ((p.chips || 0) > max) max = p.chips;
      }
      return max;
    }

    /**
     * 获取指定玩家的第一个对手 ID
     * @private
     */
    _getFirstOpponentIdFor(playerId) {
      if (!this.gameContext || !this.gameContext.players) return null;
      for (const p of this.gameContext.players) {
        if (p.id === playerId) continue;
        if (this._isPlayerAvailable(p)) return p.id;
      }
      return null;
    }

    /**
     * 获取 hero 当前筹码
     * @private
     */
    _getHeroChips() {
      if (!this.gameContext || !this.gameContext.players) return 0;
      const hero = this.gameContext.players.find(p => p.id === this.heroId);
      return hero ? (hero.chips || 0) : 0;
    }

    /**
     * 获取对手中最高筹码
     * @private
     */
    _getMaxOpponentChips() {
      if (!this.gameContext || !this.gameContext.players) return 0;
      let max = 0;
      for (const p of this.gameContext.players) {
        if (p.id === this.heroId) continue;
        if (!this._isPlayerAvailable(p)) continue;
        if ((p.chips || 0) > max) max = p.chips;
      }
      return max;
    }

    /**
     * 计算完整的力量对抗结果（供 UI 预览用）
     * @param {object} playerForce - 玩家的 force
     * @param {object} enemyForce  - 敌方的 force
     * @returns {object} 对抗详情
     */
    previewCombat(playerForce, enemyForce) {
      if (!this.attributeSystem) {
        return {
          playerPower: playerForce.power,
          enemyPower: enemyForce.power,
          netPower: playerForce.power - enemyForce.power,
          playerAttr: null,
          enemyAttr: null,
          counterMult: 1.0,
          voidDivisor: 1.0
        };
      }

      const pAttr = this.attributeSystem.getAttributeForEffect(playerForce.type);
      const eAttr = this.attributeSystem.getAttributeForEffect(enemyForce.type);

      const pAttrs = this.attributeSystem.getAttributes(playerForce.ownerId);
      const eAttrs = this.attributeSystem.getAttributes(enemyForce.ownerId);

      const pBonus = this.attributeSystem.getAttributeBonus(pAttrs[pAttr] || 0);
      const eBonus = this.attributeSystem.getAttributeBonus(eAttrs[eAttr] || 0);

      const pCounter = this.attributeSystem.getCounterMultiplier(pAttr, eAttr);
      const eCounter = this.attributeSystem.getCounterMultiplier(eAttr, pAttr);

      const pFinal = Math.round(playerForce.power * pBonus * pCounter * 10) / 10;
      const eFinal = Math.round(enemyForce.power * eBonus * eCounter * 10) / 10;

      const voidDivisor = this.switchSystem ? this.switchSystem.getVoidDivisor() : 1.0;
      const eAfterVoid = Math.round((eFinal / voidDivisor) * 10) / 10;

      return {
        playerPower: pFinal,
        enemyPower: eAfterVoid,
        netPower: Math.round((pFinal - eAfterVoid) * 10) / 10,
        playerAttr: pAttr,
        enemyAttr: eAttr,
        playerBonus: pBonus,
        enemyBonus: eBonus,
        playerCounterMult: pCounter,
        enemyCounterMult: eCounter,
        voidDivisor: voidDivisor
      };
    }
  }

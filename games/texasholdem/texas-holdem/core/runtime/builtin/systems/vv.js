/**
 * Runtime Module: BuiltinRoleModules / VV runtime system
 * Split from the legacy builtin-role-modules.js without behavior changes.
 */
(function(global) {
  'use strict';

  var Builtin = global.AceBuiltinRuntime = global.AceBuiltinRuntime || {};

  function hasOwnerPendingSkillKey() { return Builtin.hasOwnerPendingSkillKey.apply(null, arguments); }
  function getTraitEffect() { return Builtin.getTraitEffect.apply(null, arguments); }
  function getGamePlayers() { return Builtin.getGamePlayers.apply(null, arguments); }
  function getPlayerById() { return Builtin.getPlayerById.apply(null, arguments); }
  function getActiveOpponents() { return Builtin.getActiveOpponents.apply(null, arguments); }
  function getLedger() { return Builtin.getLedger.apply(null, arguments); }
  function getSkillSystem() { return Builtin.getSkillSystem.apply(null, arguments); }
  function getPlayerManaPool() { return Builtin.getPlayerManaPool.apply(null, arguments); }
  function getPlayerSkills() { return Builtin.getPlayerSkills.apply(null, arguments); }
  function getForceRuntime() { return Builtin.getForceRuntime.apply(null, arguments); }
  function queueRuntimeForce() { return Builtin.queueRuntimeForce.apply(null, arguments); }
  function removeRuntimeForces() { return Builtin.removeRuntimeForces.apply(null, arguments); }
  function isRuntimePlayerLive() { return Builtin.isRuntimePlayerLive.apply(null, arguments); }
  function guardConfiguredRole() { return Builtin.guardConfiguredRole.apply(null, arguments); }
  function clearStatusMarkSafe() { return Builtin.clearStatusMarkSafe.apply(null, arguments); }
  function getBubbleValue() { return Builtin.getBubbleValue.apply(null, arguments); }
  function getBubbleTotal() { return Builtin.getBubbleTotal.apply(null, arguments); }
  function getVvPositionPacks() { return Builtin.getVvPositionPacks.apply(null, arguments); }
  function getActiveTableChipTotal() { return Builtin.getActiveTableChipTotal.apply(null, arguments); }
  function summarizeVvTargetPositions() { return Builtin.summarizeVvTargetPositions.apply(null, arguments); }
  function syncVvTargetAssets() { return Builtin.syncVvTargetAssets.apply(null, arguments); }
  function getVvDeviationState() { return Builtin.getVvDeviationState.apply(null, arguments); }
  function resolveRuntimePhase() { return Builtin.resolveRuntimePhase.apply(null, arguments); }
  function triggerEulaliaRealtimeAbsorb() { return Builtin.triggerEulaliaRealtimeAbsorb.apply(null, arguments); }

  var VV_MARK_ICON = Builtin.VV_MARK_ICON;
  var VV_POSITION_KEY = Builtin.VV_POSITION_KEY;
  var VV_POSITION_UNIT = Builtin.VV_POSITION_UNIT;

  var vvManaChangeSnapshot = Object.create(null);

  function getVvTargetState(runtimeApi, targetId, casterId) {
    var mana = getPlayerManaPool(runtimeApi, targetId);
    var manaRatio = mana && mana.max > 0 ? (mana.current / mana.max) : 0;
    var summary = summarizeVvTargetPositions(runtimeApi, targetId, casterId);
    var deviationLevel = 0;
    var dominantDirection = 'flat';
    for (var i = 0; i < summary.packs.length; i++) {
      var state = getVvDeviationState(runtimeApi, summary.packs[i], targetId);
      if (state.level > deviationLevel) {
        deviationLevel = state.level;
        dominantDirection = state.direction;
      }
    }
    return {
      positionCount: summary.count,
      bubbleTotal: getBubbleTotal(runtimeApi, targetId),
      chaosTotal: getChaosPressure(runtimeApi, targetId),
      manaRatio: manaRatio,
      deviationLevel: deviationLevel,
      entrySize: summary.entrySize,
      dominantDirection: dominantDirection
    };
  }

  function buildVvResolvedForceSnapshot(runtimeApi) {
    var forceRuntime = getForceRuntime(runtimeApi);
    if (!forceRuntime || typeof forceRuntime.resolveSnapshot !== 'function') return [];
    return forceRuntime.resolveSnapshot(runtimeApi, {
      useCollectActiveForces: true
    }) || [];
  }

  function getFortunePressure(runtimeApi, ownerId) {
    var pending = buildVvResolvedForceSnapshot(runtimeApi);
    var total = getBubbleValue(runtimeApi, ownerId, 'bubble_fortune');
    for (var i = 0; i < pending.length; i++) {
      var force = pending[i];
      if (!force || force.type !== 'fortune') continue;
      if (force.ownerId !== ownerId) continue;
      total += Math.max(0, Number(force.effectivePower != null ? force.effectivePower : force.power || 0));
    }
    return total;
  }

  function getChaosPressure(runtimeApi, ownerId) {
    var pending = buildVvResolvedForceSnapshot(runtimeApi);
    var total = getBubbleValue(runtimeApi, ownerId, 'bubble_chaos');
    for (var i = 0; i < pending.length; i++) {
      var force = pending[i];
      if (!force || force.type !== 'curse') continue;
      if (force.targetId !== ownerId) continue;
      if (force.ownerId === ownerId) continue;
      total += Math.max(0, Number(force.effectivePower != null ? force.effectivePower : force.power || 0));
    }
    return total;
  }

  function hasChaosProfile(runtimeApi, ownerId) {
    var skills = getPlayerSkills(runtimeApi, ownerId);
    for (var i = 0; i < skills.length; i++) {
      if (!skills[i]) continue;
      if (skills[i].system === 'chaos') return true;
    }
    return false;
  }

  function isLowManaTarget(runtimeApi, ownerId) {
    var player = getPlayerById(runtimeApi, ownerId);
    if (player && (player.roleId === 'KAZU' || player.roleId === 'POPPY')) return true;
    var mana = getPlayerManaPool(runtimeApi, ownerId);
    return !!(mana && mana.max > 0 && mana.max <= 60);
  }

  function getVvTargetDeviationLevel(runtimeApi, ownerId, casterId) {
    var summary = summarizeVvTargetPositions(runtimeApi, ownerId, casterId);
    var level = 0;
    for (var i = 0; i < summary.packs.length; i++) {
      level = Math.max(level, getVvDeviationState(runtimeApi, summary.packs[i], ownerId).level);
    }
    return level;
  }

  function getVvTargetForecastState(runtimeApi, player, casterId) {
    if (!player) return null;
    var chips = Math.max(0, Number(player.chips || 0));
    var tableTotal = Math.max(1, getActiveTableChipTotal(runtimeApi));
    var tableShare = chips / tableTotal;
    var mana = getPlayerManaPool(runtimeApi, player.id);
    var manaRatio = mana && mana.max > 0 ? (mana.current / mana.max) : 0;
    var fortunePressure = getFortunePressure(runtimeApi, player.id);
    var chaosPressure = getChaosPressure(runtimeApi, player.id);
    var positionSummary = summarizeVvTargetPositions(runtimeApi, player.id, casterId);
    var deviationLevel = getVvTargetDeviationLevel(runtimeApi, player.id, casterId);
    var commitment = Math.max(0, Number(player.totalBet || 0));
    var commitmentRatio = chips > 0 ? Math.min(1.25, commitment / Math.max(1, chips + commitment)) : 0;
    return {
      chips: chips,
      tableShare: tableShare,
      manaRatio: manaRatio,
      fortunePressure: fortunePressure,
      chaosPressure: chaosPressure,
      positionCount: positionSummary.count,
      entrySize: positionSummary.entrySize,
      deviationLevel: deviationLevel,
      commitment: commitment,
      commitmentRatio: commitmentRatio
    };
  }

  function scoreVvRisePotential(roleCtx, target, runtimeApi) {
    if (!target) return -999;
    var state = getVvTargetForecastState(runtimeApi, target, roleCtx.owner && roleCtx.owner.id);
    if (!state) return -999;
    var phase = String(roleCtx.ctx && roleCtx.ctx.phase || '').toLowerCase();
    var score = 0;
    score += state.tableShare * 42;
    score += state.manaRatio * 18;
    score += Math.max(0, state.fortunePressure) * 0.78;
    score += Math.max(0, state.chaosPressure) * 0.18;
    score += state.commitmentRatio * 14;
    score += Math.max(0, state.deviationLevel - 1) * 6;
    if (phase === 'preflop') score += state.tableShare * 10;
    if (phase === 'turn' || phase === 'river') score += state.commitmentRatio * 6;
    return score;
  }

  function scoreVvFallPotential(roleCtx, target, runtimeApi) {
    if (!target) return -999;
    var state = getVvTargetForecastState(runtimeApi, target, roleCtx.owner && roleCtx.owner.id);
    if (!state) return -999;
    var phase = String(roleCtx.ctx && roleCtx.ctx.phase || '').toLowerCase();
    var score = 0;
    score += (1 - state.manaRatio) * 20;
    score += Math.max(0, state.chaosPressure) * 0.82;
    score += Math.max(0, state.fortunePressure) * 0.14;
    score += state.commitmentRatio * 16;
    score += Math.max(0, 0.34 - state.tableShare) * 26;
    score += Math.max(0, state.deviationLevel - 1) * 8;
    if (phase === 'turn' || phase === 'river') score += state.commitmentRatio * 8;
    return score;
  }

  function scoreVvTargetDelta(roleCtx, target, runtimeApi) {
    var rise = scoreVvRisePotential(roleCtx, target, runtimeApi);
    var fall = scoreVvFallPotential(roleCtx, target, runtimeApi);
    return {
      riseScore: rise,
      fallScore: fall,
      edge: rise - fall,
      direction: rise >= fall ? 'bullish' : 'bearish',
      strength: Math.abs(rise - fall),
      state: getVvTargetForecastState(runtimeApi, target, roleCtx.owner && roleCtx.owner.id)
    };
  }

  function chooseVvClairvoyancePlan(roleCtx, runtimeApi) {
    var owner = roleCtx.owner || {};
    var ownerMana = roleCtx.mana || getPlayerManaPool(runtimeApi, owner.id) || {};
    var manaCurrent = Math.max(0, Number(ownerMana.current || 0));
    var manaMax = Math.max(1, Number(ownerMana.max || 0));
    var manaRatio = manaCurrent / manaMax;
    var phase = String(roleCtx.ctx && roleCtx.ctx.phase || '').toLowerCase();
    var opponents = getActiveOpponents(runtimeApi, owner.id);
    var best = null;

    for (var i = 0; i < opponents.length; i++) {
      var target = opponents[i];
      if (!target) continue;
      var forecast = scoreVvTargetDelta(roleCtx, target, runtimeApi);
      var targetState = getVvTargetState(runtimeApi, target.id, owner.id);
      var alreadyHolding = targetState.positionCount > 0;
      var entrySize = 1;
      if (phase !== 'preflop' && forecast.strength >= 24 && manaCurrent >= 78) entrySize = 3;
      else if (forecast.strength >= 14 && manaCurrent >= 62) entrySize = 2;
      var shouldUse = false;
      if (phase !== 'river' && !hasOwnerPendingSkillKey(roleCtx, 'bubble_liquidation') && manaCurrent >= 42 && manaRatio >= 0.28) {
        if (!alreadyHolding && phase === 'preflop') shouldUse = forecast.strength >= 16;
        else if (phase === 'flop') shouldUse = forecast.strength >= (alreadyHolding ? 13 : 10);
        else if (phase === 'turn') shouldUse = !alreadyHolding && forecast.strength >= 14;
      }
      var score = forecast.strength + entrySize * 4 - (alreadyHolding ? 6 : 0);
      if (!best || score > best.score) {
        best = {
          shouldUse: shouldUse,
          targetId: target.id,
          targetName: target.name || null,
          direction: forecast.direction,
          entrySize: entrySize,
          riseScore: forecast.riseScore,
          fallScore: forecast.fallScore,
          strength: forecast.strength,
          edge: forecast.edge,
          targetState: targetState,
          score: score
        };
      }
    }

    return best || {
      shouldUse: false,
      targetId: null,
      targetName: null,
      direction: 'bullish',
      entrySize: 1,
      riseScore: 0,
      fallScore: 0,
      strength: 0,
      edge: 0,
      targetState: null,
      score: -999
    };
  }

  function scoreVvLiquidationValue(roleCtx, position, targetState) {
    var phase = String(roleCtx.ctx && roleCtx.ctx.phase || '').toLowerCase();
    var mana = roleCtx.mana || {};
    var manaCurrent = Math.max(0, Number(mana.current || 0));
    var manaMax = Math.max(1, Number(mana.max || 0));
    var manaRatio = manaCurrent / manaMax;
    var deviationLevel = Math.max(0, Number(targetState && targetState.deviationLevel || 0));
    var bubbleTotal = Math.max(0, Number(targetState && targetState.bubbleTotal || 0));
    var value = deviationLevel * 20 + bubbleTotal * 0.65;
    if (phase === 'river') value += 18;
    if (phase === 'turn') value += 8;
    if (manaRatio <= 0.22) value += 16;
    else if (manaRatio <= 0.52) value += 8;
    if (position && position.direction === 'bearish') value += 2;
    return value;
  }

  function previewVvLiquidationOutcome(position, targetState) {
    var pack = position || {};
    var state = targetState || {};
    var bubbleFortune = Math.max(0, Number(pack.bubble_fortune || 0));
    var bubbleChaos = Math.max(0, Number(pack.bubble_chaos || 0));
    var bubbleMana = Math.max(0, Number(pack.bubble_mana || 0));
    var level = Math.max(0, Number(state.deviationLevel != null ? state.deviationLevel : state.level || 0));
    var stateDirection = state.direction || state.stateDirection || 'flat';
    var packDirection = pack.direction === 'bearish' ? 'bearish' : 'bullish';
    var recoveredMana = 0;
    var drainedMana = 0;
    var targetFortuneBurst = 0;
    var targetChaosBurst = 0;
    var selfFortune = 0;

    if (level <= 0 || stateDirection === 'flat') {
      recoveredMana += Math.ceil(bubbleMana * 0.85);
      targetFortuneBurst += bubbleFortune;
      targetChaosBurst += bubbleChaos;
    } else if (stateDirection === packDirection) {
      if (stateDirection === 'bullish') {
        targetChaosBurst += bubbleChaos + Math.ceil(bubbleFortune * (level === 1 ? 1 : (level === 2 ? 1.33 : 1.66)));
        recoveredMana += Math.ceil(bubbleMana * (level === 1 ? 1.25 : (level === 2 ? 1.5 : 1.75)));
        drainedMana += Math.ceil(bubbleMana * (level === 1 ? 0.25 : (level === 2 ? 0.5 : 0.75)));
      } else {
        selfFortune += Math.ceil(bubbleFortune * (level === 1 ? 1 : (level === 2 ? 1.25 : 1.5)));
        targetChaosBurst += Math.ceil(bubbleChaos * (level === 1 ? 0.5 : (level === 2 ? 0.75 : 1)));
        recoveredMana += Math.ceil(bubbleMana * (level === 1 ? 1.25 : (level === 2 ? 1.5 : 1.75)));
      }
    } else {
      recoveredMana += Math.ceil(bubbleMana * 0.6);
      targetFortuneBurst += Math.ceil(bubbleFortune * 0.5);
      targetChaosBurst += Math.ceil(bubbleChaos * 0.5);
    }

    return {
      recoveredMana: recoveredMana,
      drainedMana: drainedMana,
      targetFortuneBurst: targetFortuneBurst,
      targetChaosBurst: targetChaosBurst,
      selfFortune: selfFortune
    };
  }

  function chooseVvLiquidationTarget(roleCtx, runtimeApi) {
    var owner = roleCtx.owner || {};
    var phase = String(roleCtx.ctx && roleCtx.ctx.phase || '').toLowerCase();
    var ownerMana = roleCtx.mana || getPlayerManaPool(runtimeApi, owner.id) || {};
    var manaCurrent = Math.max(0, Number(ownerMana.current || 0));
    var manaMax = Math.max(1, Number(ownerMana.max || 0));
    var manaRatio = manaCurrent / manaMax;
    var opponents = getActiveOpponents(runtimeApi, owner.id);
    var best = null;

    for (var i = 0; i < opponents.length; i++) {
      var target = opponents[i];
      if (!target) continue;
      var summary = summarizeVvTargetPositions(runtimeApi, target.id, owner.id);
      if (!summary.count) continue;
      var targetState = getVvTargetState(runtimeApi, target.id, owner.id);
      var deviationLevel = Math.max(0, Number(targetState.deviationLevel || 0));
      var bubbleTotal = Math.max(0, Number(targetState.bubbleTotal || 0));
      var leadPack = summary.packs[0] || {};
      var preview = previewVvLiquidationOutcome(leadPack, targetState);
      var score = scoreVvLiquidationValue(roleCtx, leadPack, targetState);
      var shouldUse = false;
      if (phase !== 'preflop') {
        if (deviationLevel >= 3) shouldUse = true;
        else if (deviationLevel >= 2 && (phase === 'river' || manaRatio <= 0.52 || bubbleTotal >= 36)) shouldUse = true;
        else if (deviationLevel >= 1 && phase === 'river' && bubbleTotal >= 24) shouldUse = true;
        else if (manaRatio <= 0.22 && deviationLevel >= 1 && bubbleTotal >= 18) shouldUse = true;
      }
      var wouldSelfBacklash = manaCurrent > 0 && manaCurrent <= 16;
      var weakLiquidation = preview.drainedMana <= 0 &&
        preview.recoveredMana < 12 &&
        (preview.targetFortuneBurst + preview.targetChaosBurst + preview.selfFortune) < 24;
      if (wouldSelfBacklash && weakLiquidation) {
        shouldUse = false;
        score -= 24;
      }
      if (!best || score > best.score) {
        best = {
          shouldUse: shouldUse,
          targetId: target.id,
          targetName: target.name || null,
          direction: leadPack.direction === 'bearish' ? 'bearish' : 'bullish',
          entrySize: Math.max(1, Number(leadPack.entrySize || 1) || 1),
          deviationLevel: deviationLevel,
          bubbleTotal: bubbleTotal,
          score: score,
          targetState: targetState,
          preview: preview,
          wouldSelfBacklash: wouldSelfBacklash
        };
      }
    }

    return best || {
      shouldUse: false,
      targetId: null,
      targetName: null,
      direction: 'bullish',
      entrySize: 1,
      deviationLevel: 0,
      bubbleTotal: 0,
      score: -999,
      targetState: null,
      preview: null,
      wouldSelfBacklash: false
    };
  }

  function logVvAiPlan(runtimeApi, eventName, roleCtx, payload) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem || typeof skillSystem._log !== 'function') return;
    skillSystem._log(eventName, Object.assign({
      ownerId: roleCtx.owner && roleCtx.owner.id,
      ownerName: roleCtx.owner && roleCtx.owner.name,
      phase: roleCtx.ctx && roleCtx.ctx.phase || null
    }, payload || {}));
  }

  function resolveVvPrimaryTarget(runtimeApi, ownerId, roleCtx) {
    var opponents = getActiveOpponents(runtimeApi, ownerId);
    if (opponents.length === 0) return null;
    var syntheticRoleCtx = roleCtx || {
      owner: getPlayerById(runtimeApi, ownerId) || { id: ownerId },
      ctx: { phase: resolveRuntimePhase(runtimeApi, null) }
    };
    opponents.sort(function(a, b) {
      var aScore = scoreVvTargetDelta(syntheticRoleCtx, a, runtimeApi);
      var bScore = scoreVvTargetDelta(syntheticRoleCtx, b, runtimeApi);
      return bScore.strength - aScore.strength;
    });
    return opponents[0] || null;
  }

  function setManaCurrent(runtimeApi, ownerId, nextValue, reason) {
    var skillSystem = getSkillSystem(runtimeApi);
    var pool = getPlayerManaPool(runtimeApi, ownerId);
    if (!skillSystem || !pool) return;
    var previous = Math.max(0, Number(pool.current || 0));
    pool.current = Math.max(0, Math.min(pool.max, Math.round(nextValue)));
    skillSystem.emit('mana:changed', {
      ownerId: pool.ownerId != null ? pool.ownerId : ownerId,
      manaPoolId: pool.id || null,
      casterRoleId: pool.casterRoleId || null,
      casterSlot: pool.casterSlot || null,
      previous: previous,
      current: pool.current,
      max: pool.max,
      reason: reason || 'runtime'
    });
  }

  function setPlayerChips(runtimeApi, ownerId, nextValue, reason) {
    var player = getPlayerById(runtimeApi, ownerId);
    var skillSystem = getSkillSystem(runtimeApi);
    if (!player) return 0;
    player.chips = Math.max(0, Math.round(nextValue || 0));
    if (skillSystem && typeof skillSystem.emit === 'function') {
      skillSystem.emit('chips:changed', {
        ownerId: ownerId,
        current: player.chips,
        reason: reason || 'runtime'
      });
    }
    if (runtimeApi && runtimeApi.skillUI && typeof runtimeApi.skillUI.updateDisplay === 'function') {
      runtimeApi.skillUI.updateDisplay();
      if (typeof runtimeApi.skillUI.updateButtons === 'function') runtimeApi.skillUI.updateButtons();
    }
    return player.chips;
  }

  function getVvServiceFeeCollectors(runtimeApi) {
    var players = getGamePlayers(runtimeApi);
    var collectors = [];
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      if (!player || player.isActive === false || player.folded) continue;
      var fee = getTraitEffect(runtimeApi, player.id, 'vv_service_fee');
      if (!fee) continue;
      collectors.push({ player: player, fee: fee });
    }
    return collectors;
  }

  function grantVvServiceFee(runtimeApi, collectorId, sourceOwnerId, amount, resourceType, sourceSkillKey, extra) {
    var skillSystem = getSkillSystem(runtimeApi);
    var collector = getPlayerById(runtimeApi, collectorId);
    var fee = getTraitEffect(runtimeApi, collectorId, 'vv_service_fee');
    if (!collector || !fee || !skillSystem) return;

    var gross = Math.max(0, Number(amount || 0));
    if (gross <= 0) return;

    var rate = Number(fee.siphonRate || 0.06);
    var manaCap = fee.maxManaFee != null ? Number(fee.maxManaFee) : Number(fee.maxRefund || 10);
    var fortuneCap = fee.maxFortuneFee != null ? Number(fee.maxFortuneFee) : gross;
    var manaFee = Math.min(manaCap, Math.max(1, Math.ceil(gross * rate)));
    var fortuneFee = Math.min(fortuneCap, Math.max(1, Math.ceil(gross * rate)));

    if (resourceType === 'mana' && manaFee > 0 && typeof skillSystem.regenMana === 'function') {
      skillSystem.regenMana(collectorId, manaFee);
    }

    if (resourceType !== 'mana' && fortuneFee > 0 && Array.isArray(skillSystem.pendingForces)) {
      skillSystem.pendingForces.push({
        ownerId: collectorId,
        ownerName: collector.name,
        type: 'fortune',
        kind: 'fortune',
        power: fortuneFee,
        effectivePower: fortuneFee,
        level: 0,
        system: 'moirai',
        activation: 'passive',
        source: 'vv_service_fee',
        skillKey: 'service_fee',
        _vvServiceFee: true
      });
    }

    skillSystem.emit('vv:service_fee', {
      collectorId: collectorId,
      collectorName: collector.name,
      sourceOwnerId: sourceOwnerId,
      resourceType: resourceType,
      amount: gross,
      manaFee: manaFee,
      fortuneFee: fortuneFee,
      sourceSkillKey: sourceSkillKey,
      extra: extra || null
    });
  }

  function applyVvServiceFeeForGain(runtimeApi, sourceOwnerId, beneficiaryId, amount, resourceType, sourceSkillKey, extra) {
    var collectors = getVvServiceFeeCollectors(runtimeApi);
    for (var i = 0; i < collectors.length; i++) {
      grantVvServiceFee(
        runtimeApi,
        collectors[i].player.id,
        sourceOwnerId,
        amount,
        resourceType,
        sourceSkillKey,
        Object.assign({ beneficiaryId: beneficiaryId }, extra || {})
      );
    }
  }

  function handleVvServiceFeeActivation(payload, runtimeApi) {
    if (!payload || !payload.skill || payload.skill.activation !== 'active') return;
    var skill = payload.skill;
    var effect = payload.type || skill.effect;
    if (effect !== 'clairvoyance') return;

    var targetId = payload.targetId != null ? payload.targetId : payload.protectId;
    if (targetId == null) return;
    var requestedEntrySize = Math.max(1, Math.min(3,
      Number(
        payload.entrySize != null ? payload.entrySize :
        payload.positionEntrySize != null ? payload.positionEntrySize :
        payload.options && payload.options.entrySize != null ? payload.options.entrySize :
        1
      ) || 1
    ));
    var packPower = VV_POSITION_UNIT * requestedEntrySize;
    applyVvServiceFeeForGain(runtimeApi, skill.ownerId, targetId, packPower, 'fortune', skill.skillKey, {
      targetId: targetId,
      direction: payload.direction || (payload.options && payload.options.direction) || 'bullish',
      entrySize: requestedEntrySize
    });
    applyVvServiceFeeForGain(runtimeApi, skill.ownerId, targetId, packPower, 'mana', skill.skillKey, {
      targetId: targetId,
      direction: payload.direction || (payload.options && payload.options.direction) || 'bullish',
      entrySize: requestedEntrySize
    });
  }

  function isVvServiceFeeExcludedSkillKey(skillKey) {
    var key = String(skillKey || '').toLowerCase();
    return key === 'service_fee' || key === 'bubble_liquidation';
  }

  function handleVvServiceFeeForceQueued(payload, runtimeApi) {
    var force = payload && payload.force ? payload.force : null;
    var meta = payload && payload.meta ? payload.meta : null;
    if (!force) return;
    if (force.type !== 'fortune') return;
    if (force.activation !== 'active') return;
    if (force._vvServiceFee) return;
    if (isVvServiceFeeExcludedSkillKey(force.skillKey)) return;

    var sourceOwnerId = meta && meta.ownerId != null ? meta.ownerId : force.ownerId;
    var beneficiaryId = force.ownerId != null ? force.ownerId : null;
    var amount = Math.max(0, Number(force.effectivePower != null ? force.effectivePower : force.power || 0));
    if (beneficiaryId == null || amount <= 0) return;

    applyVvServiceFeeForGain(runtimeApi, sourceOwnerId, beneficiaryId, amount, 'fortune', force.skillKey, {
      source: force.source || null,
      targetId: meta && meta.targetId != null ? meta.targetId : null
    });
  }

  function syncVvManaSnapshots(runtimeApi) {
    var players = getGamePlayers(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      if (!player) continue;
      var pool = getPlayerManaPool(runtimeApi, player.id);
      vvManaChangeSnapshot[player.id] = pool ? Math.max(0, Number(pool.current || 0)) : 0;
    }
  }

  function isVvServiceFeeExcludedManaReason(reason) {
    var key = String(reason || '').toLowerCase();
    return !key ||
      key === 'runtime' ||
      key === 'runtime_regen' ||
      key === 'street_regen' ||
      key === 'vv_liquidation_reclaim' ||
      key === 'eulalia_sanctuary_core' ||
      key === 'poppy_cockroach' ||
      key === 'kuzuha_grace_period' ||
      key === 'kako_signoff_flow' ||
      key === 'cota_burst_misc' ||
      key === 'cota_burst_refund' ||
      key === 'trixie_blind_box_revert' ||
      key === 'vv_clairvoyance_position';
  }

  function inferVvManaFeeSkillKey(reason) {
    var key = String(reason || '').toLowerCase();
    if (key === 'trixie_blind_box') return 'blind_box';
    return key || 'runtime_mana_gain';
  }

  function handleVvServiceFeeManaChanged(payload, runtimeApi) {
    if (!payload || payload.ownerId == null) return;
    var ownerId = Number(payload.ownerId);
    var current = Math.max(0, Number(payload.current || 0));
    var previous = vvManaChangeSnapshot[ownerId];
    vvManaChangeSnapshot[ownerId] = current;
    if (previous == null) return;

    var delta = current - previous;
    if (delta <= 0) return;
    if (isVvServiceFeeExcludedManaReason(payload.reason)) return;

    applyVvServiceFeeForGain(runtimeApi, ownerId, ownerId, delta, 'mana', inferVvManaFeeSkillKey(payload.reason), {
      reason: payload.reason || null
    });
  }

  function handleVvServiceFeePsyche(payload, runtimeApi) {
    var meta = payload && payload.meta ? payload.meta : null;
    var events = meta && Array.isArray(meta.psycheEvents) ? meta.psycheEvents : [];
    if (!events.length) return;

    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (!ev || ev.action !== 'convert') continue;
      var beneficiary = findPlayerByName(runtimeApi, ev.beneficiary);
      if (!beneficiary) continue;
      applyVvServiceFeeForGain(
        runtimeApi,
        beneficiary.id,
        beneficiary.id,
        ev.convertedPower || 0,
        'convert',
        ev.arbiterType || 'psyche_convert',
        { arbiterOwner: ev.arbiterOwner || null }
      );
    }
  }

  function findPlayerByName(runtimeApi, name) {
    var players = getGamePlayers(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      if (players[i] && players[i].name === name) return players[i];
    }
    return null;
  }

  function syncVvBubbleMarks(runtimeApi) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem) return;
    if (!guardConfiguredRole(runtimeApi, 'VV', function(api) {
      var players = getGamePlayers(api);
      for (var pi = 0; pi < players.length; pi++) {
        if (players[pi]) clearStatusMarkSafe(skillSystem, players[pi].id, 'vv_bubble_mark');
      }
    })) return;

    var players = getGamePlayers(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      if (!player) continue;
      if (!isRuntimePlayerLive(player)) {
        clearStatusMarkSafe(skillSystem, player.id, 'vv_bubble_mark');
        continue;
      }
      var total = getBubbleTotal(runtimeApi, player.id);
      var summary = summarizeVvTargetPositions(runtimeApi, player.id);
      var count = summary.count;
      var badgeCount = summary.entrySize > 0 ? summary.entrySize : count;
      if (count > 0 || total > 0) {
        skillSystem.setStatusMark(player.id, 'vv_bubble_mark', {
          sourceName: 'VV',
          icon: VV_MARK_ICON,
          title: '泡沫头寸',
          tone: 'vv',
          duration: 'persistent',
          value: total,
          count: badgeCount,
          badgeText: badgeCount > 0 ? (badgeCount > 9 ? '9+' : String(badgeCount)) : '',
          detail: '入仓数量: ' + badgeCount +
            '\n头寸笔数: ' + count +
            '\n看涨仓位: ' + summary.bullishSize +
            '\n看跌仓位: ' + summary.bearishSize +
            '\n泡沫 fortune: ' + getBubbleValue(runtimeApi, player.id, 'bubble_fortune') +
            '\n泡沫 chaos: ' + getBubbleValue(runtimeApi, player.id, 'bubble_chaos') +
            '\n泡沫 mana: ' + getBubbleValue(runtimeApi, player.id, 'bubble_mana')
        });
      } else {
        skillSystem.clearStatusMark(player.id, 'vv_bubble_mark');
      }
    }
  }

  function clearVvInjectedForces(runtimeApi) {
    removeRuntimeForces(runtimeApi, function(force) {
      return !!(force && force._vvBubbleAsset);
    }, {
      reason: 'vv_bubble_refresh'
    });
  }

  function injectVvBubbleForces(runtimeApi) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem || !Array.isArray(skillSystem.pendingForces)) return;

    clearVvInjectedForces(runtimeApi);
    var phase = resolveRuntimePhase(runtimeApi, null);

    var players = getGamePlayers(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      if (!player || player.folded || player.isActive === false) continue;

      var summary = summarizeVvTargetPositions(runtimeApi, player.id);
      var fortuneByOwner = Object.create(null);
      for (var fp = 0; fp < summary.packs.length; fp++) {
        var fortunePack = summary.packs[fp] || {};
        var fortuneOwnerId = fortunePack.ownerId != null ? fortunePack.ownerId : player.id;
        fortuneByOwner[fortuneOwnerId] = (fortuneByOwner[fortuneOwnerId] || 0) + Math.max(0, Number(fortunePack.bubble_fortune || 0));
      }

      var fortuneOwnerIds = Object.keys(fortuneByOwner);
      for (var fi = 0; fi < fortuneOwnerIds.length; fi++) {
        var sourceFortuneId = Number(fortuneOwnerIds[fi]);
        var fortuneTotal = Math.max(0, Number(fortuneByOwner[fortuneOwnerIds[fi]] || 0));
        if (fortuneTotal <= 0) continue;
        var fortuneSource = getPlayerById(runtimeApi, sourceFortuneId);
        skillSystem.pendingForces.push({
          ownerId: sourceFortuneId,
          ownerName: fortuneSource ? fortuneSource.name : 'VV',
          targetId: player.id,
          targetName: player.name,
          type: 'fortune',
          kind: 'fortune',
          power: fortuneTotal,
          effectivePower: fortuneTotal,
          level: 0,
          system: 'moirai',
          activation: 'passive',
          source: 'vv_bubble',
          skillKey: 'clairvoyance',
          _vvBubbleAsset: true
        });
      }

      var chaosByOwner = Object.create(null);
      for (var p = 0; p < summary.packs.length; p++) {
        var pack = summary.packs[p] || {};
        var ownerId = pack.ownerId != null ? pack.ownerId : player.id;
        chaosByOwner[ownerId] = (chaosByOwner[ownerId] || 0) + Math.max(0, Number(pack.bubble_chaos || 0));
      }

      var ownerIds = Object.keys(chaosByOwner);
      for (var c = 0; c < ownerIds.length; c++) {
        var sourceId = Number(ownerIds[c]);
        var chaosTotal = Math.max(0, Number(chaosByOwner[ownerIds[c]] || 0));
        if (chaosTotal <= 0) continue;
        var source = getPlayerById(runtimeApi, sourceId);
        skillSystem.pendingForces.push({
          ownerId: sourceId,
          ownerName: source ? source.name : 'VV',
          type: 'curse',
          kind: 'curse',
          targetId: player.id,
          power: chaosTotal,
          effectivePower: chaosTotal,
          level: 0,
          system: 'chaos',
          activation: 'passive',
          source: 'vv_bubble',
          skillKey: 'clairvoyance',
          _vvBubbleAsset: true
        });
      }
    }

    triggerEulaliaRealtimeAbsorb(runtimeApi, phase, 'eulalia_absorb_vv_bubble');
  }

  function refreshVvPositionAssets(runtimeApi) {
    syncVvBubbleMarks(runtimeApi);
  }

  function handleVvClairvoyance(payload, runtimeApi) {
    if (!payload || !payload.skill) return;
    var skill = payload.skill;
    var ledger = getLedger(runtimeApi);
    if (!ledger) return;

    var targetId = payload.targetId != null ? Number(payload.targetId)
      : payload.protectId != null ? Number(payload.protectId)
      : null;
    if (targetId === skill.ownerId) {
      targetId = null;
    }
    if (targetId == null) {
      var target = resolveVvPrimaryTarget(runtimeApi, skill.ownerId);
      targetId = target ? target.id : null;
    }
    if (targetId == null) return;

    var manaPool = getPlayerManaPool(runtimeApi, targetId);
    var requestedEntrySize = Math.max(1, Math.min(3,
      Number(
        payload.entrySize != null ? payload.entrySize :
        payload.positionEntrySize != null ? payload.positionEntrySize :
        payload.options && payload.options.entrySize != null ? payload.options.entrySize :
        1
      ) || 1
    ));
    var requestedDirection = payload.direction != null ? payload.direction
      : payload.positionDirection != null ? payload.positionDirection
      : payload.options && payload.options.direction != null ? payload.options.direction
      : 'bullish';
    requestedDirection = requestedDirection === 'bearish' ? 'bearish' : 'bullish';
    var packPower = VV_POSITION_UNIT * requestedEntrySize;
    var targetPlayer = getPlayerById(runtimeApi, targetId);
    var nextPacks = getVvPositionPacks(runtimeApi, targetId).filter(function(pack) {
      return !(pack && pack.ownerId === skill.ownerId);
    });

    nextPacks.push({
      targetId: targetId,
      ownerId: skill.ownerId,
      ownerName: skill.ownerName,
      baselineTargetChips: Math.max(0, Number(targetPlayer && targetPlayer.chips || 0)),
      baselineTableChips: getActiveTableChipTotal(runtimeApi),
      bubble_fortune: packPower,
      bubble_chaos: packPower,
      bubble_mana: packPower,
      entrySize: requestedEntrySize,
      direction: requestedDirection,
      createdPhase: payload.phase || null,
      icon: VV_MARK_ICON
    });
    var nextEntrySize = 0;
    for (var pi = 0; pi < nextPacks.length; pi++) {
      var nextPack = nextPacks[pi] || {};
      nextEntrySize += Math.max(1, Number(nextPack.entrySize != null ? nextPack.entrySize : 1) || 1);
    }
    ledger.setAsset(targetId, VV_POSITION_KEY, nextPacks.length, {
      positions: nextPacks,
      entrySize: nextEntrySize,
      icon: VV_MARK_ICON
    });
    if (manaPool) {
      setManaCurrent(runtimeApi, targetId, manaPool.current + packPower, 'vv_clairvoyance_position');
    }
    syncVvTargetAssets(runtimeApi, targetId);
    syncVvBubbleMarks(runtimeApi);
  }

  function liquidateVvTarget(runtimeApi, casterId, casterName, target) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || !target) return null;
    var skillSystem = getSkillSystem(runtimeApi);

    var packs = getVvPositionPacks(runtimeApi, target.id).filter(function(pack) {
      return pack && pack.ownerId === casterId;
    });
    if (!packs.length) {
      return {
        targetId: target.id,
        targetName: target.name || null,
        packCount: 0,
        gross: 0,
        recoveredMana: 0,
        drainedMana: 0,
        selfFortune: 0,
        targetFortuneBurst: 0,
        targetChaosBurst: 0,
        baselineShare: 0,
        currentShare: 0
      };
    }

    var total = 0;
    var recoveredMana = 0;
    var drainMana = 0;
    var selfFortune = 0;
    var targetFortuneBurst = 0;
    var targetChaosBurst = 0;
    var baselineShare = 0;
    var currentShare = 0;
    var packDetails = [];
    var casterManaBefore = null;
    var casterManaAfter = null;
    var targetManaBefore = null;
    var targetManaAfter = null;

    for (var i = 0; i < packs.length; i++) {
      var pack = packs[i];
      var state = getVvDeviationState(runtimeApi, pack, target.id);
      var bubbleFortune = Math.max(0, Number(pack.bubble_fortune || 0));
      var bubbleChaos = Math.max(0, Number(pack.bubble_chaos || 0));
      var bubbleMana = Math.max(0, Number(pack.bubble_mana || 0));
      var fortuneBurst = 0;
      var chaosBurst = 0;
      var recoveredManaPart = 0;
      var drainManaPart = 0;
      baselineShare += Math.max(0, Number(state.baselineShare || 0));
      currentShare += Math.max(0, Number(state.currentShare || 0));

      if (state.level <= 0 || state.direction === 'flat') {
        recoveredManaPart += Math.ceil(bubbleMana * 0.85);
        fortuneBurst += bubbleFortune;
        chaosBurst += bubbleChaos;
      } else if (state.direction === pack.direction) {
        if (state.direction === 'bullish') {
          chaosBurst += bubbleChaos + Math.ceil(bubbleFortune * (state.level === 1 ? 1 : (state.level === 2 ? 1.33 : 1.66)));
          recoveredManaPart += Math.ceil(bubbleMana * (state.level === 1 ? 1.25 : (state.level === 2 ? 1.5 : 1.75)));
          drainManaPart += Math.ceil(bubbleMana * (state.level === 1 ? 0.25 : (state.level === 2 ? 0.5 : 0.75)));
        } else {
          var fortuneRecover = Math.ceil(bubbleFortune * (state.level === 1 ? 1 : (state.level === 2 ? 1.25 : 1.5)));
          queueRuntimeForce(runtimeApi, {
            ownerId: casterId,
            ownerName: casterName,
            type: 'fortune',
            kind: 'fortune',
            power: fortuneRecover,
            effectivePower: fortuneRecover,
            level: 0,
            system: 'moirai',
            activation: 'active',
            source: 'bubble_liquidation',
            skillKey: 'bubble_liquidation',
            _persistAcrossHandStart: true
          }, {
            reason: 'bubble_liquidation',
            ownerId: casterId,
            targetId: target.id
          });
          selfFortune += fortuneRecover;
          total += fortuneRecover;
          chaosBurst += Math.ceil(bubbleChaos * (state.level === 1 ? 0.5 : (state.level === 2 ? 0.75 : 1)));
          recoveredManaPart += Math.ceil(bubbleMana * (state.level === 1 ? 1.25 : (state.level === 2 ? 1.5 : 1.75)));
        }
      } else {
        recoveredManaPart += Math.ceil(bubbleMana * 0.6);
        fortuneBurst += Math.ceil(bubbleFortune * 0.5);
        chaosBurst += Math.ceil(bubbleChaos * 0.5);
      }

      recoveredMana += recoveredManaPart;
      drainMana += drainManaPart;

      if (fortuneBurst > 0) {
        queueRuntimeForce(runtimeApi, {
          ownerId: target.id,
          ownerName: target.name,
          type: 'fortune',
          kind: 'fortune',
          power: fortuneBurst,
          effectivePower: fortuneBurst,
          level: 0,
          system: 'moirai',
          activation: 'active',
          source: 'bubble_liquidation',
          skillKey: 'bubble_liquidation',
          _persistAcrossHandStart: true
        }, {
          reason: 'bubble_liquidation',
          ownerId: casterId,
          targetId: target.id
        });
        targetFortuneBurst += fortuneBurst;
        total += fortuneBurst;
      }

      if (chaosBurst > 0) {
        queueRuntimeForce(runtimeApi, {
          ownerId: casterId,
          ownerName: casterName,
          type: 'curse',
          kind: 'curse',
          targetId: target.id,
          power: chaosBurst,
          effectivePower: chaosBurst,
          level: 0,
          system: 'chaos',
          activation: 'active',
          source: 'bubble_liquidation',
          skillKey: 'bubble_liquidation',
          _persistAcrossHandStart: true
        }, {
          reason: 'bubble_liquidation',
          ownerId: casterId,
          targetId: target.id
        });
        targetChaosBurst += chaosBurst;
        total += chaosBurst;
      }

      packDetails.push({
        entrySize: Math.max(1, Number(pack.entrySize || 1) || 1),
        direction: pack.direction === 'bearish' ? 'bearish' : 'bullish',
        level: Math.max(0, Number(state.level || 0)),
        stateDirection: state.direction || 'flat',
        bubbleFortune: bubbleFortune,
        bubbleChaos: bubbleChaos,
        bubbleMana: bubbleMana,
        fortuneBurst: fortuneBurst,
        chaosBurst: chaosBurst,
        baselineShare: Math.max(0, Number(state.baselineShare || 0)),
        currentShare: Math.max(0, Number(state.currentShare || 0))
      });
    }

    if (recoveredMana > 0) {
      var casterMana = getPlayerManaPool(runtimeApi, casterId);
      if (casterMana) {
        casterManaBefore = Math.max(0, Number(casterMana.current || 0));
        if (skillSystem && typeof skillSystem.regenMana === 'function') {
          skillSystem.regenMana(casterId, recoveredMana, 'vv_liquidation_reclaim');
        } else {
          setManaCurrent(runtimeApi, casterId, casterMana.current + recoveredMana, 'vv_liquidation_reclaim');
        }
        casterManaAfter = Math.max(0, Number(casterMana.current || 0));
        recoveredMana = Math.max(0, casterManaAfter - casterManaBefore);
      }
      total += recoveredMana;
    }
    if (drainMana > 0) {
      var targetMana = getPlayerManaPool(runtimeApi, target.id);
      if (targetMana) {
        targetManaBefore = Math.max(0, Number(targetMana.current || 0));
        if (skillSystem && typeof skillSystem.loseMana === 'function') {
          drainMana = Math.max(0, Number(skillSystem.loseMana(target.id, drainMana, 'vv_liquidation_drain') || 0));
        } else {
          setManaCurrent(runtimeApi, target.id, targetMana.current - drainMana, 'vv_liquidation_drain');
          drainMana = Math.max(0, targetManaBefore - Math.max(0, Number(targetMana.current || 0)));
        }
        targetManaAfter = Math.max(0, Number(targetMana.current || 0));
      }
    }

    var remainingPacks = getVvPositionPacks(runtimeApi, target.id).filter(function(pack) {
      return !(pack && pack.ownerId === casterId);
    });
    if (remainingPacks.length > 0) {
      ledger.setAsset(target.id, VV_POSITION_KEY, remainingPacks.length, {
        positions: remainingPacks,
        icon: VV_MARK_ICON
      });
    } else {
      ledger.clearAsset(target.id, VV_POSITION_KEY);
    }
    syncVvTargetAssets(runtimeApi, target.id);
    return {
      targetId: target.id,
      targetName: target.name || null,
      packCount: packs.length,
      gross: total,
      recoveredMana: recoveredMana,
      drainedMana: drainMana,
      selfFortune: selfFortune,
      targetFortuneBurst: targetFortuneBurst,
      targetChaosBurst: targetChaosBurst,
      baselineShare: baselineShare,
      currentShare: currentShare,
      casterManaBefore: casterManaBefore,
      casterManaAfter: casterManaAfter,
      targetManaBefore: targetManaBefore,
      targetManaAfter: targetManaAfter,
      packDetails: packDetails
    };
  }

  function handleVvLiquidation(payload, runtimeApi) {
    if (!payload || !payload.skill) return;
    var casterId = payload.skill.ownerId;
    var casterName = payload.skill.ownerName;
    var skillSystem = getSkillSystem(runtimeApi);
    var targetId = payload.targetId != null ? Number(payload.targetId)
      : payload.options && payload.options.targetId != null ? Number(payload.options.targetId)
      : null;
    var targets = targetId != null
      ? [getPlayerById(runtimeApi, targetId)].filter(Boolean)
      : getActiveOpponents(runtimeApi, casterId);
    var gross = 0;

    if (!targets.length && skillSystem && typeof skillSystem.emit === 'function') {
      skillSystem.emit('vv:liquidation_resolved', {
        ownerId: casterId,
        ownerName: casterName,
        targetId: targetId,
        targetName: null,
        packCount: 0,
        gross: 0,
        recoveredMana: 0,
        drainedMana: 0,
        selfFortune: 0,
        targetFortuneBurst: 0,
        targetChaosBurst: 0,
        baselineShare: 0,
        currentShare: 0
      });
      return;
    }

    for (var i = 0; i < targets.length; i++) {
      var result = liquidateVvTarget(runtimeApi, casterId, casterName, targets[i]);
      if (!result) continue;
      gross += Math.max(0, Number(result.gross || 0));
      if (skillSystem && typeof skillSystem.emit === 'function') {
        if (typeof skillSystem._log === 'function') {
          skillSystem._log('VV_LIQUIDATION_DEBUG', {
            ownerId: casterId,
            ownerName: casterName,
            targetId: result.targetId,
            targetName: result.targetName,
            packCount: result.packCount,
            gross: result.gross,
            recoveredMana: result.recoveredMana,
            drainedMana: result.drainedMana,
            selfFortune: result.selfFortune,
            targetFortuneBurst: result.targetFortuneBurst,
            targetChaosBurst: result.targetChaosBurst,
            baselineShare: result.baselineShare,
            currentShare: result.currentShare,
            casterManaBefore: result.casterManaBefore,
            casterManaAfter: result.casterManaAfter,
            targetManaBefore: result.targetManaBefore,
            targetManaAfter: result.targetManaAfter,
            packDetails: result.packDetails
          });
        }
        skillSystem.emit('vv:liquidation_resolved', {
          ownerId: casterId,
          ownerName: casterName,
          targetId: result.targetId,
          targetName: result.targetName,
          packCount: result.packCount,
          gross: result.gross,
          recoveredMana: result.recoveredMana,
          drainedMana: result.drainedMana,
          selfFortune: result.selfFortune,
          targetFortuneBurst: result.targetFortuneBurst,
          targetChaosBurst: result.targetChaosBurst,
          baselineShare: result.baselineShare,
          currentShare: result.currentShare,
          casterManaBefore: result.casterManaBefore,
          casterManaAfter: result.casterManaAfter,
          targetManaBefore: result.targetManaBefore,
          targetManaAfter: result.targetManaAfter,
          packDetails: result.packDetails
        });
      }
    }

    syncVvBubbleMarks(runtimeApi);
  }

  Object.assign(Builtin, {
    "vvManaChangeSnapshot": vvManaChangeSnapshot,
    "getVvTargetState": getVvTargetState,
    "buildVvResolvedForceSnapshot": buildVvResolvedForceSnapshot,
    "getFortunePressure": getFortunePressure,
    "getChaosPressure": getChaosPressure,
    "hasChaosProfile": hasChaosProfile,
    "isLowManaTarget": isLowManaTarget,
    "getVvTargetDeviationLevel": getVvTargetDeviationLevel,
    "getVvTargetForecastState": getVvTargetForecastState,
    "scoreVvRisePotential": scoreVvRisePotential,
    "scoreVvFallPotential": scoreVvFallPotential,
    "scoreVvTargetDelta": scoreVvTargetDelta,
    "chooseVvClairvoyancePlan": chooseVvClairvoyancePlan,
    "scoreVvLiquidationValue": scoreVvLiquidationValue,
    "previewVvLiquidationOutcome": previewVvLiquidationOutcome,
    "chooseVvLiquidationTarget": chooseVvLiquidationTarget,
    "logVvAiPlan": logVvAiPlan,
    "resolveVvPrimaryTarget": resolveVvPrimaryTarget,
    "setManaCurrent": setManaCurrent,
    "setPlayerChips": setPlayerChips,
    "getVvServiceFeeCollectors": getVvServiceFeeCollectors,
    "grantVvServiceFee": grantVvServiceFee,
    "applyVvServiceFeeForGain": applyVvServiceFeeForGain,
    "handleVvServiceFeeActivation": handleVvServiceFeeActivation,
    "isVvServiceFeeExcludedSkillKey": isVvServiceFeeExcludedSkillKey,
    "handleVvServiceFeeForceQueued": handleVvServiceFeeForceQueued,
    "syncVvManaSnapshots": syncVvManaSnapshots,
    "isVvServiceFeeExcludedManaReason": isVvServiceFeeExcludedManaReason,
    "inferVvManaFeeSkillKey": inferVvManaFeeSkillKey,
    "handleVvServiceFeeManaChanged": handleVvServiceFeeManaChanged,
    "handleVvServiceFeePsyche": handleVvServiceFeePsyche,
    "findPlayerByName": findPlayerByName,
    "syncVvBubbleMarks": syncVvBubbleMarks,
    "clearVvInjectedForces": clearVvInjectedForces,
    "injectVvBubbleForces": injectVvBubbleForces,
    "refreshVvPositionAssets": refreshVvPositionAssets,
    "handleVvClairvoyance": handleVvClairvoyance,
    "liquidateVvTarget": liquidateVvTarget,
    "handleVvLiquidation": handleVvLiquidation
  });
})(window);

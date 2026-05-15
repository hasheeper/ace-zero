/**
 * Runtime Module: BuiltinRoleModules / TRIXIE runtime system
 * Split from the legacy builtin-role-modules.js without behavior changes.
 */
(function(global) {
  'use strict';

  var Builtin = global.AceBuiltinRuntime = global.AceBuiltinRuntime || {};

  function getStreetIndex() { return Builtin.getStreetIndex.apply(null, arguments); }
  function getTraitEffect() { return Builtin.getTraitEffect.apply(null, arguments); }
  function getGamePlayers() { return Builtin.getGamePlayers.apply(null, arguments); }
  function getPlayerById() { return Builtin.getPlayerById.apply(null, arguments); }
  function getLedger() { return Builtin.getLedger.apply(null, arguments); }
  function getSkillSystem() { return Builtin.getSkillSystem.apply(null, arguments); }
  function getPlayerManaPool() { return Builtin.getPlayerManaPool.apply(null, arguments); }
  function getForceRuntime() { return Builtin.getForceRuntime.apply(null, arguments); }
  function queueRuntimeForce() { return Builtin.queueRuntimeForce.apply(null, arguments); }
  function isRuntimePlayerLive() { return Builtin.isRuntimePlayerLive.apply(null, arguments); }
  function getRolePlayers() { return Builtin.getRolePlayers.apply(null, arguments); }
  function clearStatusMarkSafe() { return Builtin.clearStatusMarkSafe.apply(null, arguments); }
  function resolveRuntimePhase() { return Builtin.resolveRuntimePhase.apply(null, arguments); }
  function setManaCurrent() { return Builtin.setManaCurrent.apply(null, arguments); }
  function setPlayerChips() { return Builtin.setPlayerChips.apply(null, arguments); }

  var TRIXIE_WILD_ICON = Builtin.TRIXIE_WILD_ICON;
  var TRIXIE_BLIND_BOX_ICON = Builtin.TRIXIE_BLIND_BOX_ICON;
  var TRIXIE_REWRITE_DELAY_ICON = Builtin.TRIXIE_REWRITE_DELAY_ICON;
  var TRIXIE_REWRITE_EXTEND_ICON = Builtin.TRIXIE_REWRITE_EXTEND_ICON;
  var TRIXIE_WILD_CARD_KEY = Builtin.TRIXIE_WILD_CARD_KEY;
  var TRIXIE_STREET_FORTUNE_KEY = Builtin.TRIXIE_STREET_FORTUNE_KEY;
  var TRIXIE_STREET_CURSE_KEY = Builtin.TRIXIE_STREET_CURSE_KEY;
  var TRIXIE_STREET_RAW_FORTUNE_KEY = Builtin.TRIXIE_STREET_RAW_FORTUNE_KEY;
  var TRIXIE_STREET_RAW_CURSE_KEY = Builtin.TRIXIE_STREET_RAW_CURSE_KEY;
  var TRIXIE_STREET_BONUS_KEY = Builtin.TRIXIE_STREET_BONUS_KEY;
  var TRIXIE_REWRITE_QUEUE_KEY = Builtin.TRIXIE_REWRITE_QUEUE_KEY;
  var TRIXIE_BLIND_BOX_KEY = Builtin.TRIXIE_BLIND_BOX_KEY;

  function getTrixiePlayers(runtimeApi) {
    return getRolePlayers(runtimeApi, 'TRIXIE');
  }

  function getTrixieAssetValue(runtimeApi, ownerId, key) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null || !key) return 0;
    return Math.max(0, Number(ledger.getValue(ownerId, key) || 0));
  }

  function setTrixieAsset(runtimeApi, ownerId, key, value, meta) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null || !key) return null;
    return ledger.setAsset(ownerId, key, Math.max(0, Number(value || 0)), meta || null);
  }

  function clearTrixieStreetAssets(runtimeApi, ownerId) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null) return;
    ledger.clearAsset(ownerId, TRIXIE_STREET_FORTUNE_KEY);
    ledger.clearAsset(ownerId, TRIXIE_STREET_CURSE_KEY);
    ledger.clearAsset(ownerId, TRIXIE_STREET_RAW_FORTUNE_KEY);
    ledger.clearAsset(ownerId, TRIXIE_STREET_RAW_CURSE_KEY);
    ledger.clearAsset(ownerId, TRIXIE_STREET_BONUS_KEY);
  }

  function clearAllTrixieAssets(runtimeApi) {
    var ledger = getLedger(runtimeApi);
    var skillSystem = getSkillSystem(runtimeApi);
    if (!ledger) return;
    var players = getGamePlayers(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      if (!player) continue;
      ledger.clearAsset(player.id, TRIXIE_WILD_CARD_KEY);
      ledger.clearAsset(player.id, TRIXIE_REWRITE_QUEUE_KEY);
      ledger.clearAsset(player.id, TRIXIE_BLIND_BOX_KEY);
      clearTrixieStreetAssets(runtimeApi, player.id);
      if (skillSystem && typeof skillSystem.clearStatusMark === 'function') {
        skillSystem.clearStatusMark(player.id, 'trixie_wild_card');
        skillSystem.clearStatusMark(player.id, 'trixie_rewrite_delay');
        skillSystem.clearStatusMark(player.id, 'trixie_rewrite_extend');
        skillSystem.clearStatusMark(player.id, 'trixie_blind_box');
      }
    }
  }

  function getTrixieRecipientId(force) {
    if (!force) return null;
    if (force.type === 'curse') {
      return force.targetId != null ? force.targetId : null;
    }
    if (force.type === 'fortune') {
      if (force.targetId != null) return force.targetId;
      if (force.protectId != null) return force.protectId;
      return force.ownerId != null ? force.ownerId : null;
    }
    return null;
  }

  function getTrixieTakenRate(runtimeApi, ownerId, type) {
    var effect = getTraitEffect(runtimeApi, ownerId, 'trixie_paradox_frame');
    if (!effect) return 1;
    if (type === 'fortune') return Math.max(1, Number(effect.fortuneTakenRate || 1));
    if (type === 'curse') return Math.max(1, Number(effect.curseTakenRate || 1));
    return 1;
  }

  function getTrixieStageBonus(runtimeApi, ownerId, rawFortune, rawCurse) {
    var effect = getTraitEffect(runtimeApi, ownerId, 'trixie_improvised_stage');
    if (!effect) return 0;
    if (rawFortune > Number(effect.highThreshold || 80) && rawCurse > Number(effect.highThreshold || 80)) {
      return Math.max(0, Number(effect.highBonus || 50));
    }
    if (rawFortune > Number(effect.midThreshold || 40) && rawCurse > Number(effect.midThreshold || 40)) {
      return Math.max(0, Number(effect.midBonus || 25));
    }
    return 0;
  }

  function syncTrixieWildMarks(runtimeApi) {
    var skillSystem = getSkillSystem(runtimeApi);
    var players = getGamePlayers(runtimeApi);
    if (!skillSystem || !players.length) return;

    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      if (!player) continue;
      if (!isRuntimePlayerLive(player)) {
        clearStatusMarkSafe(skillSystem, player.id, 'trixie_wild_card');
        continue;
      }
      var total = getTrixieAssetValue(runtimeApi, player.id, TRIXIE_WILD_CARD_KEY);
      var tier = Math.max(0, Math.min(12, Math.floor(total / 10)));
      if (tier > 0) {
        skillSystem.setStatusMark(player.id, 'trixie_wild_card', {
          sourceName: player.name,
          icon: TRIXIE_WILD_ICON,
          title: '鬼牌',
          tone: 'trixie',
          duration: 'persistent',
          value: total,
          count: tier,
          badgeText: String(tier),
          detail: '鬼牌: ' + total + '/120'
        });
      } else if (typeof skillSystem.clearStatusMark === 'function') {
        skillSystem.clearStatusMark(player.id, 'trixie_wild_card');
      }
      if (typeof skillSystem.emit === 'function') {
        skillSystem.emit('trixie:wild_card_sync', {
          ownerId: player.id,
          ownerName: player.name,
          wildCard: total,
          tier: tier,
          hasMark: tier > 0
        });
      }
    }
  }

  function queueTrixieOverflowCurse(runtimeApi, ownerId, power) {
    var owner = getPlayerById(runtimeApi, ownerId);
    if (!owner || power <= 0) return 0;
    var opponents = getGamePlayers(runtimeApi).filter(function(player) {
      return player && player.id !== ownerId;
    });
    var target = opponents.length ? opponents[Math.floor(Math.random() * opponents.length)] : owner;
    if (!target) return 0;
    queueRuntimeForce(runtimeApi, {
      ownerId: ownerId,
      ownerName: owner.name,
      type: 'curse',
      kind: 'curse',
      targetId: target.id,
      targetName: target.name,
      power: power,
      effectivePower: power,
      level: 0,
      system: 'chaos',
      activation: 'active',
      source: 'trixie_wild_overflow',
      skillKey: 'wild_card_core',
      _trixieWildOverflow: true
    }, {
      reason: 'trixie_wild_overflow',
      ownerId: ownerId,
      targetId: target.id
    });
    return power;
  }

  function forgeTrixieWildCard(runtimeApi, payload, owner) {
    if (!owner) return;
    var core = getTraitEffect(runtimeApi, owner.id, 'trixie_wild_card_core');
    if (!core) return;
    var forceRuntime = getForceRuntime(runtimeApi);
    var summary = payload && payload.summary ? payload.summary : null;
    if (!summary && forceRuntime && typeof forceRuntime.getLastStreetReceivedTotals === 'function') {
      summary = forceRuntime.getLastStreetReceivedTotals({
        excludeSources: ['trixie_rule_rewrite'],
        excludeFlags: ['_trixieWildOverflow']
      });
    }
    var recipients = summary && summary.recipients ? summary.recipients : null;
    var entry = recipients ? recipients[String(owner.id)] : null;
    if (!entry) {
      setTrixieAsset(runtimeApi, owner.id, TRIXIE_STREET_RAW_FORTUNE_KEY, 0, {
        phase: payload && payload.phase != null ? payload.phase : null
      });
      setTrixieAsset(runtimeApi, owner.id, TRIXIE_STREET_RAW_CURSE_KEY, 0, {
        phase: payload && payload.phase != null ? payload.phase : null
      });
      setTrixieAsset(runtimeApi, owner.id, TRIXIE_STREET_FORTUNE_KEY, 0, {
        phase: payload && payload.phase != null ? payload.phase : null
      });
      setTrixieAsset(runtimeApi, owner.id, TRIXIE_STREET_CURSE_KEY, 0, {
        phase: payload && payload.phase != null ? payload.phase : null
      });
      setTrixieAsset(runtimeApi, owner.id, TRIXIE_STREET_BONUS_KEY, 0, {
        phase: payload && payload.phase != null ? payload.phase : null
      });
      syncTrixieWildMarks(runtimeApi);
      return;
    }

    var rawFortune = Math.max(0, Number(entry.rawFortune || 0));
    var rawCurse = Math.max(0, Number(entry.rawCurse || 0));
    var adjustedFortune = Math.max(0, Math.ceil(Number(entry.effectiveFortune || 0)));
    var adjustedCurse = Math.max(0, Math.ceil(Number(entry.effectiveCurse || 0)));
    var bonus = getTrixieStageBonus(runtimeApi, owner.id, rawFortune, rawCurse);
    var forged = Math.ceil((adjustedFortune + adjustedCurse) * Math.max(0, Number(core.convertRate || 0.5)));
    var before = getTrixieAssetValue(runtimeApi, owner.id, TRIXIE_WILD_CARD_KEY);
    var cap = Math.max(0, Number(core.cap || 120));
    var totalGain = forged + bonus;
    var overflow = Math.max(0, before + totalGain - cap);
    var after = Math.min(cap, before + totalGain);

    setTrixieAsset(runtimeApi, owner.id, TRIXIE_STREET_RAW_FORTUNE_KEY, rawFortune, {
      phase: payload.phase || null
    });
    setTrixieAsset(runtimeApi, owner.id, TRIXIE_STREET_RAW_CURSE_KEY, rawCurse, {
      phase: payload.phase || null
    });
    setTrixieAsset(runtimeApi, owner.id, TRIXIE_STREET_FORTUNE_KEY, adjustedFortune, {
      phase: payload.phase || null
    });
    setTrixieAsset(runtimeApi, owner.id, TRIXIE_STREET_CURSE_KEY, adjustedCurse, {
      phase: payload.phase || null
    });
    setTrixieAsset(runtimeApi, owner.id, TRIXIE_STREET_BONUS_KEY, bonus, {
      phase: payload.phase || null
    });
    setTrixieAsset(runtimeApi, owner.id, TRIXIE_WILD_CARD_KEY, after, {
      phase: payload.phase || null,
      forged: forged,
      bonus: bonus,
      overflow: overflow
    });

    if (overflow > 0) {
      queueTrixieOverflowCurse(runtimeApi, owner.id, Math.ceil(overflow * 0.5));
    }
    syncTrixieWildMarks(runtimeApi);

    var skillSystem = getSkillSystem(runtimeApi);
    if (skillSystem && typeof skillSystem.emit === 'function') {
      skillSystem.emit('trixie:wild_card_forged', {
        ownerId: owner.id,
        ownerName: owner.name,
        phase: payload.phase || null,
        rawFortune: rawFortune,
        rawCurse: rawCurse,
        adjustedFortune: adjustedFortune,
        adjustedCurse: adjustedCurse,
        forged: forged,
        bonus: bonus,
        before: before,
        after: after,
        overflow: overflow
      });
    }
  }

  function getTrixieAsset(runtimeApi, ownerId, key) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null || !key) return null;
    return ledger.getAsset(ownerId, key);
  }

  function getTrixieRewriteContracts(runtimeApi, ownerId) {
    var forceRuntime = getForceRuntime(runtimeApi);
    if (forceRuntime && typeof forceRuntime.getScheduledStreetContracts === 'function') {
      return forceRuntime.getScheduledStreetContracts(runtimeApi, ownerId, TRIXIE_REWRITE_QUEUE_KEY);
    }
    var asset = getTrixieAsset(runtimeApi, ownerId, TRIXIE_REWRITE_QUEUE_KEY);
    return asset && Array.isArray(asset.contracts) ? asset.contracts.slice() : [];
  }

  function setTrixieRewriteContracts(runtimeApi, ownerId, contracts, meta) {
    var forceRuntime = getForceRuntime(runtimeApi);
    if (forceRuntime && typeof forceRuntime.setScheduledStreetContracts === 'function') {
      return forceRuntime.setScheduledStreetContracts(runtimeApi, ownerId, TRIXIE_REWRITE_QUEUE_KEY, contracts, meta);
    }
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null) return null;
    var nextContracts = Array.isArray(contracts) ? contracts.slice() : [];
    if (!nextContracts.length) {
      ledger.clearAsset(ownerId, TRIXIE_REWRITE_QUEUE_KEY);
      return null;
    }
    return ledger.setAsset(ownerId, TRIXIE_REWRITE_QUEUE_KEY, nextContracts.length, Object.assign({
      contracts: nextContracts
    }, meta || {}));
  }

  function getTrixieBlindBoxContract(runtimeApi, ownerId) {
    var asset = getTrixieAsset(runtimeApi, ownerId, TRIXIE_BLIND_BOX_KEY);
    return asset && asset.contract ? Object.assign({}, asset.contract) : null;
  }

  function setTrixieBlindBoxContract(runtimeApi, ownerId, contract, meta) {
    var ledger = getLedger(runtimeApi);
    if (!ledger || ownerId == null) return null;
    if (!contract) {
      ledger.clearAsset(ownerId, TRIXIE_BLIND_BOX_KEY);
      return null;
    }
    return ledger.setAsset(ownerId, TRIXIE_BLIND_BOX_KEY, Math.max(0, Number(contract.remainingStreets || 0)), Object.assign({
      contract: Object.assign({}, contract)
    }, meta || {}));
  }

  function clearTrixieRuntimeMarks(runtimeApi, ownerId) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem || typeof skillSystem.clearStatusMark !== 'function' || ownerId == null) return;
    skillSystem.clearStatusMark(ownerId, 'trixie_rewrite_delay');
    skillSystem.clearStatusMark(ownerId, 'trixie_rewrite_extend');
    skillSystem.clearStatusMark(ownerId, 'trixie_blind_box');
  }

  function getNextPhase(phase) {
    var key = String(phase || '').toLowerCase();
    if (key === 'preflop') return 'flop';
    if (key === 'flop') return 'turn';
    if (key === 'turn') return 'river';
    return 'river';
  }

  function syncTrixieRewriteMarks(runtimeApi, ownerId, phaseOverride) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem || ownerId == null) return;
    var owner = getPlayerById(runtimeApi, ownerId);
    if (!owner || !isRuntimePlayerLive(owner)) {
      clearStatusMarkSafe(skillSystem, ownerId, 'trixie_rewrite_delay');
      clearStatusMarkSafe(skillSystem, ownerId, 'trixie_rewrite_extend');
      return;
    }
    var contracts = getTrixieRewriteContracts(runtimeApi, ownerId);
    var forceRuntime = getForceRuntime(runtimeApi);
    var currentPhase = phaseOverride || resolveRuntimePhase(runtimeApi, null);
    var delayCount = 0;
    var extendCount = 0;

    for (var i = 0; i < contracts.length; i++) {
      var contract = contracts[i];
      if (!contract) continue;
      var stageCount = forceRuntime && typeof forceRuntime.countScheduledStreetStages === 'function'
        ? forceRuntime.countScheduledStreetStages(contract, currentPhase)
        : 0;
      if (contract.modifier === 'delay') {
        if (Number(contract.waitStreets || 0) > 0) {
          stageCount = Math.max(stageCount, 2);
        } else if (
          (Number(contract.stagesRemaining || 0) > 0) ||
          (Number(contract.displayStagesRemaining || 0) > 0)
        ) {
          stageCount = Math.max(stageCount, 1);
        }
      }
      if (contract.modifier === 'extend') {
        if (
          contract.consumeCurrentStreetOnResolve === true ||
          Number(contract.createdStreetIndex || -1) === getStreetIndex(currentPhase)
        ) {
          stageCount = Math.max(stageCount, 2);
        } else if (
          (Number(contract.stagesRemaining || 0) > 0) ||
          (Number(contract.displayStagesRemaining || 0) > 0)
        ) {
          stageCount = Math.max(stageCount, 1);
        }
      }
      if (contract.modifier === 'delay') delayCount += stageCount;
      if (contract.modifier === 'extend') extendCount += stageCount;
    }

    if (delayCount > 0) {
      skillSystem.setStatusMark(ownerId, 'trixie_rewrite_delay', {
        sourceName: owner ? owner.name : 'TRIXIE',
        icon: TRIXIE_REWRITE_DELAY_ICON,
        title: '延后一街',
        tone: 'trixie',
        duration: 'persistent',
        count: delayCount,
        badgeText: String(delayCount),
        detail: '规则篡改将在下一街生效'
      });
    } else if (typeof skillSystem.clearStatusMark === 'function') {
      skillSystem.clearStatusMark(ownerId, 'trixie_rewrite_delay');
    }

    if (extendCount > 0) {
      skillSystem.setStatusMark(ownerId, 'trixie_rewrite_extend', {
        sourceName: owner ? owner.name : 'TRIXIE',
        icon: TRIXIE_REWRITE_EXTEND_ICON,
        title: '增加一街',
        tone: 'trixie',
        duration: 'persistent',
        count: extendCount,
        badgeText: String(extendCount),
        detail: '规则篡改将覆盖本街并追加下一街'
      });
    } else if (typeof skillSystem.clearStatusMark === 'function') {
      skillSystem.clearStatusMark(ownerId, 'trixie_rewrite_extend');
    }
  }

  function syncTrixieBlindBoxMark(runtimeApi, ownerId) {
    var skillSystem = getSkillSystem(runtimeApi);
    if (!skillSystem || ownerId == null) return;
    var owner = getPlayerById(runtimeApi, ownerId);
    if (!owner || !isRuntimePlayerLive(owner)) {
      clearStatusMarkSafe(skillSystem, ownerId, 'trixie_blind_box');
      return;
    }
    var contract = getTrixieBlindBoxContract(runtimeApi, ownerId);
    if (contract) {
      skillSystem.setStatusMark(ownerId, 'trixie_blind_box', {
        sourceName: owner ? owner.name : 'TRIXIE',
        icon: TRIXIE_BLIND_BOX_ICON,
        title: '盲盒派对',
        tone: 'trixie',
        duration: 'persistent',
        count: Math.max(0, Number(contract.remainingStreets || 0)),
        badgeText: String(Math.max(0, Number(contract.remainingStreets || 0))),
        detail: '账户篡位剩余街数: ' + Math.max(0, Number(contract.remainingStreets || 0))
      });
    } else if (typeof skillSystem.clearStatusMark === 'function') {
      skillSystem.clearStatusMark(ownerId, 'trixie_blind_box');
    }
  }

  function syncAllTrixieRuntimeMarks(runtimeApi, phaseOverride) {
    var players = getTrixiePlayers(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      syncTrixieRewriteMarks(runtimeApi, players[i].id, phaseOverride);
      syncTrixieBlindBoxMark(runtimeApi, players[i].id);
    }
  }

  function resolveTrixieRewriteTargets(runtimeApi, ownerId, contract) {
    var players = getGamePlayers(runtimeApi);
    if (!players.length || !contract) return [];
    if (contract.mode === 'fortune_self') {
      if (contract.global) {
        return players.filter(function(player) {
          return player && player.isActive !== false && !player.folded;
        }).map(function(player) { return player.id; });
      }
      return [ownerId];
    }
    if (contract.global) {
      return players.filter(function(player) {
        return player && player.id !== ownerId && player.isActive !== false && !player.folded;
      }).map(function(player) { return player.id; });
    }
    if (contract.targetId == null) return [];
    var target = getPlayerById(runtimeApi, contract.targetId);
    if (!target || target.isActive === false || target.folded) return [];
    return [target.id];
  }

  function queueTrixieRewriteForces(runtimeApi, ownerId, contract, meta) {
    var owner = getPlayerById(runtimeApi, ownerId);
    if (!owner || !contract) return 0;
    var targets = resolveTrixieRewriteTargets(runtimeApi, ownerId, contract);
    var totalQueued = 0;

    for (var i = 0; i < targets.length; i++) {
      var targetId = targets[i];
      var target = getPlayerById(runtimeApi, targetId);
      if (!target) continue;
      var force = {
        ownerId: ownerId,
        ownerName: owner.name,
        type: contract.mode === 'fortune_self' ? 'fortune' : 'curse',
        power: Math.max(0, Number(contract.power || 0)),
        effectivePower: Math.max(0, Number(contract.power || 0)),
        level: skill && skill.level != null ? skill.level : 2,
        system: 'chaos',
        activation: 'active',
        source: 'trixie_rule_rewrite',
        skillKey: 'rule_rewrite'
      };
      if (force.type === 'fortune') {
        force.targetId = targetId;
        force.targetName = target.name;
      } else {
        force.targetId = targetId;
        force.targetName = target.name;
      }
      queueRuntimeForce(runtimeApi, force, Object.assign({
        reason: 'trixie_rule_rewrite',
        ownerId: ownerId,
        targetId: targetId
      }, meta || {}));
      totalQueued += Math.max(0, Number(contract.power || 0));
    }
    return totalQueued;
  }

  function consumeTrixieWildCard(runtimeApi, ownerId) {
    var current = getTrixieAssetValue(runtimeApi, ownerId, TRIXIE_WILD_CARD_KEY);
    setTrixieAsset(runtimeApi, ownerId, TRIXIE_WILD_CARD_KEY, 0, {
      source: 'trixie_skill_consume'
    });
    syncTrixieWildMarks(runtimeApi);
    return current;
  }

  function handleTrixieRuleRewrite(payload, runtimeApi) {
    var skill = payload && payload.skill;
    var ownerId = skill && skill.ownerId;
    var options = payload && payload.options ? payload.options : {};
    if (ownerId == null) return;

    var owner = getPlayerById(runtimeApi, ownerId);
    if (!owner) return;

    var mode = String(options.rewriteMode || 'fortune_self');
    var modifier = String(options.rewriteModifier || 'none');
    var isGlobal = options.rewriteGlobal === true;
    var targetId = options.targetId != null ? Number(options.targetId) : null;
    if (mode === 'curse_target' && !isGlobal && targetId == null) return;
    var wildCard = consumeTrixieWildCard(runtimeApi, ownerId);
    if (wildCard <= 0) return;
    var modeMultiplier = mode === 'curse_target' ? 1.33 : 1;
    var modifierMultiplier = modifier === 'delay' ? 0.9 : modifier === 'extend' ? 0.75 : 1;
    var rangeMultiplier = isGlobal ? 0.5 : 1;
    var totalPower = Math.max(1, Math.ceil(wildCard * modeMultiplier * modifierMultiplier * rangeMultiplier));
    var contracts = getTrixieRewriteContracts(runtimeApi, ownerId);
    var phase = resolveRuntimePhase(runtimeApi, payload);
    var forceRuntime = getForceRuntime(runtimeApi);
    var scheduledShots = modifier === 'extend' ? 2 : 1;
    var scheduleDelay = modifier === 'delay' ? 1 : 0;
    var rewriteContract = forceRuntime && typeof forceRuntime.createStreetEffectContract === 'function'
      ? forceRuntime.createStreetEffectContract(phase, {
          delayStreets: scheduleDelay,
          futureStageCount: scheduledShots,
          includeCurrentStreet: false,
          crossHand: true,
          payload: {
            modifier: modifier,
            mode: mode,
            global: isGlobal,
            targetId: targetId,
            power: totalPower
          }
        })
      : null;

    if (rewriteContract) contracts.push(rewriteContract);

    setTrixieRewriteContracts(runtimeApi, ownerId, contracts, {
      source: 'rule_rewrite',
      modifier: modifier
    });
    syncTrixieRewriteMarks(runtimeApi, ownerId);

    var skillSystem = getSkillSystem(runtimeApi);
    if (skillSystem && typeof skillSystem.emit === 'function') {
      if (typeof skillSystem._log === 'function') {
        skillSystem._log('TRIXIE_RULE_REWRITE_CAST', {
          ownerId: ownerId,
          ownerName: owner.name,
          mode: mode,
          modifier: modifier,
          global: isGlobal,
          targetId: targetId,
          wildConsumed: wildCard,
          totalPower: totalPower,
          scheduledShots: scheduledShots,
          scheduleDelay: scheduleDelay,
          phase: phase
        });
      }
      skillSystem.emit('trixie:rule_rewrite_cast', {
        ownerId: ownerId,
        ownerName: owner.name,
        mode: mode,
        modifier: modifier,
        global: isGlobal,
        targetId: targetId,
        wildConsumed: wildCard,
        totalPower: totalPower,
        scheduledShots: scheduledShots,
        scheduleDelay: scheduleDelay,
        phase: phase
      });
    }
  }

  function injectTrixieRewriteContracts(runtimeApi, payload) {
    var phase = resolveRuntimePhase(runtimeApi, payload);
    var players = getTrixiePlayers(runtimeApi);
    var skillSystem = getSkillSystem(runtimeApi);
    var forceRuntime = getForceRuntime(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      var owner = players[i];
      var contracts = forceRuntime && typeof forceRuntime.collectDueStreetContracts === 'function'
        ? forceRuntime.collectDueStreetContracts(runtimeApi, owner.id, TRIXIE_REWRITE_QUEUE_KEY, phase)
        : [];
      for (var j = 0; j < contracts.length; j++) {
        var contract = contracts[j];
        if (!contract) continue;
        queueTrixieRewriteForces(runtimeApi, owner.id, contract, {
          modifier: contract.modifier,
          contractId: contract.id,
          phase: phase
        });
      if (skillSystem && typeof skillSystem.emit === 'function') {
        if (typeof skillSystem._log === 'function') {
          skillSystem._log('TRIXIE_RULE_REWRITE_CONTRACT', {
            ownerId: owner.id,
            ownerName: owner.name,
            contractId: contract.id,
            modifier: contract.modifier,
            startPhase: contract.createdStreetIndex,
            currentPhase: phase,
            remainingShots: forceRuntime && typeof forceRuntime.countScheduledStreetStages === 'function'
              ? forceRuntime.countScheduledStreetStages(contract, phase)
              : Math.max(0, Number(contract.displayStagesRemaining || 0)),
            power: contract.power
          });
        }
        skillSystem.emit('trixie:rule_rewrite_contract', {
          ownerId: owner.id,
          ownerName: owner.name,
            contractId: contract.id,
            modifier: contract.modifier,
            startPhase: contract.createdStreetIndex,
            currentPhase: phase,
            remainingShots: forceRuntime && typeof forceRuntime.countScheduledStreetStages === 'function'
              ? forceRuntime.countScheduledStreetStages(contract, phase)
              : Math.max(0, Number(contract.displayStagesRemaining || 0)),
            power: contract.power
          });
        }
      }
    }
  }

  function advanceTrixieRewriteContracts(runtimeApi, payload) {
    var phase = resolveRuntimePhase(runtimeApi, payload);
    var nextPhase = getNextPhase(phase);
    var forceRuntime = getForceRuntime(runtimeApi);
    var skillSystem = getSkillSystem(runtimeApi);
    var players = getTrixiePlayers(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      var owner = players[i];
      if (forceRuntime && typeof forceRuntime.pruneStreetContracts === 'function') {
        forceRuntime.pruneStreetContracts(runtimeApi, owner.id, TRIXIE_REWRITE_QUEUE_KEY, phase);
      } else {
        setTrixieRewriteContracts(runtimeApi, owner.id, [], {
          phase: phase
        });
      }
      syncTrixieRewriteMarks(runtimeApi, owner.id, nextPhase);
      if (skillSystem && typeof skillSystem.emit === 'function') {
        if (typeof skillSystem._log === 'function') {
          skillSystem._log('TRIXIE_RULE_REWRITE_TICK', {
            ownerId: owner.id,
            ownerName: owner.name,
            phase: phase,
            nextPhase: nextPhase,
            remainingStages: getTrixieRewriteContracts(runtimeApi, owner.id).reduce(function(sum, contract) {
              var forceRt = getForceRuntime(runtimeApi);
              if (!forceRt || typeof forceRt.countScheduledStreetStages !== 'function') return sum;
              return sum + forceRt.countScheduledStreetStages(contract, nextPhase);
            }, 0)
          });
        }
        skillSystem.emit('trixie:rule_rewrite_tick', {
          ownerId: owner.id,
          ownerName: owner.name,
          phase: phase,
          nextPhase: nextPhase,
          remainingStages: getTrixieRewriteContracts(runtimeApi, owner.id).reduce(function(sum, contract) {
            var forceRt = getForceRuntime(runtimeApi);
            if (!forceRt || typeof forceRt.countScheduledStreetStages !== 'function') return sum;
            return sum + forceRt.countScheduledStreetStages(contract, nextPhase);
          }, 0)
        });
      }
    }
  }

  function getBlindBoxParticipantShare(runtimeApi, participantId) {
    var player = getPlayerById(runtimeApi, participantId);
    var mana = getPlayerManaPool(runtimeApi, participantId);
    return {
      chips: Math.max(0, Math.floor(Number(player && player.chips || 0) * 0.5)),
      mana: Math.max(0, Math.floor(Number(mana && mana.current || 0) * 0.5))
    };
  }

  function splitBlindBoxTotals(total) {
    var safeTotal = Math.max(0, Number(total || 0));
    var first = Math.ceil(safeTotal / 2);
    return [first, safeTotal - first];
  }

  function applyBlindBoxSwap(runtimeApi, contract) {
    if (!contract || !Array.isArray(contract.participantIds) || contract.participantIds.length !== 2) return;
    var aId = Number(contract.participantIds[0]);
    var bId = Number(contract.participantIds[1]);
    var aPlayer = getPlayerById(runtimeApi, aId);
    var bPlayer = getPlayerById(runtimeApi, bId);
    var aMana = getPlayerManaPool(runtimeApi, aId);
    var bMana = getPlayerManaPool(runtimeApi, bId);
    if (!aPlayer || !bPlayer || !aMana || !bMana) return;

    var chipSplit = splitBlindBoxTotals(Number(aPlayer.chips || 0) + Number(bPlayer.chips || 0));
    var manaSplit = splitBlindBoxTotals(Number(aMana.current || 0) + Number(bMana.current || 0));

    setPlayerChips(runtimeApi, aId, chipSplit[0], 'trixie_blind_box');
    setPlayerChips(runtimeApi, bId, chipSplit[1], 'trixie_blind_box');
    setManaCurrent(runtimeApi, aId, manaSplit[0], 'trixie_blind_box');
    setManaCurrent(runtimeApi, bId, manaSplit[1], 'trixie_blind_box');
  }

  function revertBlindBoxSwap(runtimeApi, contract) {
    if (!contract || !Array.isArray(contract.participantIds) || contract.participantIds.length !== 2) return;
    var aId = Number(contract.participantIds[0]);
    var bId = Number(contract.participantIds[1]);
    var aPlayer = getPlayerById(runtimeApi, aId);
    var bPlayer = getPlayerById(runtimeApi, bId);
    var aMana = getPlayerManaPool(runtimeApi, aId);
    var bMana = getPlayerManaPool(runtimeApi, bId);
    if (!aPlayer || !bPlayer || !aMana || !bMana) return;

    var chipSplit = splitBlindBoxTotals(Number(aPlayer.chips || 0) + Number(bPlayer.chips || 0));
    var manaSplit = splitBlindBoxTotals(Number(aMana.current || 0) + Number(bMana.current || 0));

    setPlayerChips(runtimeApi, aId, chipSplit[0], 'trixie_blind_box_revert');
    setPlayerChips(runtimeApi, bId, chipSplit[1], 'trixie_blind_box_revert');
    setManaCurrent(runtimeApi, aId, manaSplit[0], 'trixie_blind_box_revert');
    setManaCurrent(runtimeApi, bId, manaSplit[1], 'trixie_blind_box_revert');
  }

  function handleTrixieBlindBox(payload, runtimeApi) {
    var skill = payload && payload.skill;
    var ownerId = skill && skill.ownerId;
    var options = payload && payload.options ? payload.options : {};
    if (ownerId == null) return;
    var owner = getPlayerById(runtimeApi, ownerId);
    if (!owner) return;

    var participantIds = Array.isArray(options.participantIds)
      ? options.participantIds.map(function(id) { return Number(id); }).filter(function(id) { return Number.isFinite(id); })
      : [];
    if (participantIds.length !== 2 || participantIds[0] === participantIds[1]) return;
    var wildCard = consumeTrixieWildCard(runtimeApi, ownerId);
    if (wildCard <= 0) return;

    var contract = {
      ownerId: ownerId,
      participantIds: participantIds.slice(0, 2),
      remainingStreets: 3,
      wildConsumed: wildCard,
      aShare: getBlindBoxParticipantShare(runtimeApi, participantIds[0]),
      bShare: getBlindBoxParticipantShare(runtimeApi, participantIds[1])
    };

    applyBlindBoxSwap(runtimeApi, contract);
    setTrixieBlindBoxContract(runtimeApi, ownerId, contract, {
      source: 'blind_box'
    });
    syncTrixieBlindBoxMark(runtimeApi, ownerId);

    var skillSystem = getSkillSystem(runtimeApi);
    if (skillSystem && typeof skillSystem.emit === 'function') {
      skillSystem.emit('trixie:blind_box_cast', {
        ownerId: ownerId,
        ownerName: owner.name,
        participantIds: contract.participantIds.slice(),
        remainingStreets: contract.remainingStreets,
        wildConsumed: wildCard,
        aShare: Object.assign({}, contract.aShare),
        bShare: Object.assign({}, contract.bShare)
      });
    }
  }

  function advanceTrixieBlindBoxContracts(runtimeApi, payload) {
    var phase = resolveRuntimePhase(runtimeApi, payload);
    var players = getTrixiePlayers(runtimeApi);
    var skillSystem = getSkillSystem(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      var owner = players[i];
      var contract = getTrixieBlindBoxContract(runtimeApi, owner.id);
      if (!contract) continue;
      contract.remainingStreets = Math.max(0, Number(contract.remainingStreets || 0) - 1);
      if (contract.remainingStreets <= 0) {
        revertBlindBoxSwap(runtimeApi, contract);
        setTrixieBlindBoxContract(runtimeApi, owner.id, null);
        syncTrixieBlindBoxMark(runtimeApi, owner.id);
        if (skillSystem && typeof skillSystem.emit === 'function') {
          skillSystem.emit('trixie:blind_box_revert', {
            ownerId: owner.id,
            ownerName: owner.name,
            participantIds: contract.participantIds.slice(),
            phase: phase
          });
        }
      } else {
        setTrixieBlindBoxContract(runtimeApi, owner.id, contract, {
          phase: phase
        });
        syncTrixieBlindBoxMark(runtimeApi, owner.id);
        if (skillSystem && typeof skillSystem.emit === 'function') {
          skillSystem.emit('trixie:blind_box_tick', {
            ownerId: owner.id,
            ownerName: owner.name,
            remainingStreets: contract.remainingStreets,
            phase: phase
          });
        }
      }
    }
  }

  function clearTrixieContractsOnHandEnd(runtimeApi, payload) {
    var forceRuntime = getForceRuntime(runtimeApi);
    var players = getTrixiePlayers(runtimeApi);
    for (var i = 0; i < players.length; i++) {
      var owner = players[i];
      var contract = getTrixieBlindBoxContract(runtimeApi, owner.id);
      if (contract) {
        revertBlindBoxSwap(runtimeApi, contract);
        setTrixieBlindBoxContract(runtimeApi, owner.id, null);
      }
      if (forceRuntime && typeof forceRuntime.clearScheduledStreetContracts === 'function') {
        forceRuntime.clearScheduledStreetContracts(runtimeApi, owner.id, TRIXIE_REWRITE_QUEUE_KEY, {
          keepCrossHand: true,
          meta: {
            phase: payload && payload.phase != null ? payload.phase : null
          }
        });
      } else {
        var keptContracts = getTrixieRewriteContracts(runtimeApi, owner.id).filter(function(rewriteContract) {
          return rewriteContract && rewriteContract.crossHand === true;
        });
        setTrixieRewriteContracts(runtimeApi, owner.id, keptContracts, {
          phase: payload && payload.phase != null ? payload.phase : null
        });
      }
      syncTrixieRewriteMarks(runtimeApi, owner.id);
      syncTrixieBlindBoxMark(runtimeApi, owner.id);
    }
  }

  function handleTrixieSkillActivationEvent(payload, runtimeApi) {
    if (!payload || !payload.skill || payload.skill.ownerId == null) return;
    if (payload.__trixieRuntimeHandled) return;
    payload.__trixieRuntimeHandled = true;
    if (payload.type === 'rule_rewrite' || payload.skill.effect === 'rule_rewrite') {
      handleTrixieRuleRewrite(payload, runtimeApi);
      return;
    }
    if (payload.type === 'blind_box' || payload.skill.effect === 'blind_box') {
      handleTrixieBlindBox(payload, runtimeApi);
    }
  }

  Object.assign(Builtin, {
    "getTrixiePlayers": getTrixiePlayers,
    "getTrixieAssetValue": getTrixieAssetValue,
    "setTrixieAsset": setTrixieAsset,
    "clearTrixieStreetAssets": clearTrixieStreetAssets,
    "clearAllTrixieAssets": clearAllTrixieAssets,
    "getTrixieRecipientId": getTrixieRecipientId,
    "getTrixieTakenRate": getTrixieTakenRate,
    "getTrixieStageBonus": getTrixieStageBonus,
    "syncTrixieWildMarks": syncTrixieWildMarks,
    "queueTrixieOverflowCurse": queueTrixieOverflowCurse,
    "forgeTrixieWildCard": forgeTrixieWildCard,
    "getTrixieAsset": getTrixieAsset,
    "getTrixieRewriteContracts": getTrixieRewriteContracts,
    "setTrixieRewriteContracts": setTrixieRewriteContracts,
    "getTrixieBlindBoxContract": getTrixieBlindBoxContract,
    "setTrixieBlindBoxContract": setTrixieBlindBoxContract,
    "clearTrixieRuntimeMarks": clearTrixieRuntimeMarks,
    "getNextPhase": getNextPhase,
    "syncTrixieRewriteMarks": syncTrixieRewriteMarks,
    "syncTrixieBlindBoxMark": syncTrixieBlindBoxMark,
    "syncAllTrixieRuntimeMarks": syncAllTrixieRuntimeMarks,
    "resolveTrixieRewriteTargets": resolveTrixieRewriteTargets,
    "queueTrixieRewriteForces": queueTrixieRewriteForces,
    "consumeTrixieWildCard": consumeTrixieWildCard,
    "handleTrixieRuleRewrite": handleTrixieRuleRewrite,
    "injectTrixieRewriteContracts": injectTrixieRewriteContracts,
    "advanceTrixieRewriteContracts": advanceTrixieRewriteContracts,
    "getBlindBoxParticipantShare": getBlindBoxParticipantShare,
    "splitBlindBoxTotals": splitBlindBoxTotals,
    "applyBlindBoxSwap": applyBlindBoxSwap,
    "revertBlindBoxSwap": revertBlindBoxSwap,
    "handleTrixieBlindBox": handleTrixieBlindBox,
    "advanceTrixieBlindBoxContracts": advanceTrixieBlindBoxContracts,
    "clearTrixieContractsOnHandEnd": clearTrixieContractsOnHandEnd,
    "handleTrixieSkillActivationEvent": handleTrixieSkillActivationEvent
  });
})(window);

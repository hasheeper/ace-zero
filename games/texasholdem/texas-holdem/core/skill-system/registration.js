(function (global) {
  'use strict';

  var modules = global.AceSkillSystemModules = global.AceSkillSystemModules || {};
  var SkillSystem = modules.SkillSystem;
  var ACTIVATION = modules.ACTIVATION;
  var MANA_BY_LEVEL = modules.MANA_BY_LEVEL;
  var lookupSkill = modules.lookupSkill;
  var RoleRuntime = global.RoleRuntime || {};
  if (!SkillSystem) throw new Error('AceSkillSystemModules.SkillSystem is not loaded');

  Object.assign(SkillSystem.prototype, {
    registerFromConfig(config, playerIdMap) {
      this.skills.clear();
      this.manaPools.clear();
      this.ownerManaPools.clear();
      this.setAssetModifiers(config && config.assetModifiers ? config.assetModifiers : null);

      // 解析玩家ID映射
      const idMap = playerIdMap || {};
      const heroId = idMap.heroId != null ? idMap.heroId : 0;
      const seatIds = idMap.seats || {};
      this._heroId = heroId; // 存储供 getState() 使用

      console.log('[SKILL-SYS] registerFromConfig heroId=' + heroId, 'seatIds=', seatIds);

      // --- Hero ---
      if (config.hero) {
        const h = config.hero;
        const level = this._getCharLevel(h);
        const name = this._getCharName(h);

        // v5 格式：区分主手/副手技能
        const vName = (h.vanguard && h.vanguard.name) || 'KAZU';
        const rName = (h.rearguard && h.rearguard.name) || null;
        const vLevel = h.vanguard && h.vanguard.level != null ? h.vanguard.level : level;
        const rLevel = h.rearguard && h.rearguard.level != null ? h.rearguard.level : 0;

        if (h.vanguardSkills || h.rearguardSkills) {
          const vPoolId = this._makeManaPoolId(heroId, 'vanguard');
          const vManaConfig = this._buildManaConfig(h.vanguard || h, vLevel, h);
          this._registerManaPool(vPoolId, vManaConfig, {
            ownerId: heroId,
            ownerName: name,
            casterName: vName,
            casterSlot: 'vanguard',
            casterRoleId: vName,
            isDefault: true
          });
          // 主手技能
          if (h.vanguardSkills) {
            this._registerSkillList(heroId, name, 'human', h.vanguardSkills, vName, {
              casterSlot: 'vanguard',
              casterRoleId: vName,
              manaPoolId: vPoolId
            });
          }
          // 副手技能
          if (h.rearguardSkills && rName) {
            const rPoolId = this._makeManaPoolId(heroId, 'rearguard');
            const rManaConfig = this._buildManaConfig(h.rearguard || {}, rLevel, h);
            this._registerManaPool(rPoolId, rManaConfig, {
              ownerId: heroId,
              ownerName: name,
              casterName: rName,
              casterSlot: 'rearguard',
              casterRoleId: rName,
              isDefault: false
            });
            this._registerSkillList(heroId, name, 'human', h.rearguardSkills, rName, {
              casterSlot: 'rearguard',
              casterRoleId: rName,
              manaPoolId: rPoolId
            });
          }
        } else {
          // 兼容旧格式：单一 skills 数组
          const manaConfig = this._buildManaConfig(h, level);
          this._registerEntity(heroId, name, 'human', h.skills || {}, manaConfig);
        }
      }

      // --- Seats (NPC) ---
      if (config.seats) {
        const seatOrder = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
        let fallbackIndex = 1;
        for (const seat of seatOrder) {
          const s = config.seats[seat];
          if (!s) continue;
          // 使用 playerIdMap 中的真实 ID，否则 fallback 递增
          const npcId = seatIds[seat] != null ? seatIds[seat] : fallbackIndex;
          const level = this._getCharLevel(s);
          const name = this._getCharName(s) || seat;
          const manaConfig = this._buildManaConfig(s, level);
          this._registerEntity(npcId, name, 'ai', s.skills || {}, manaConfig, {
            seat: seat,
            casterSlot: 'default'
          });
          fallbackIndex++;
        }
      }

      this.emit('skills:loaded', { total: this.skills.size });
      this._log('SKILLS_LOADED', { total: this.skills.size });
    },

    _getCharLevel(char) {
      const vLv = (char.vanguard && char.vanguard.level) || 0;
      const rLv = (char.rearguard && char.rearguard.level) || 0;
      return Math.max(vLv, rLv);
    },

    _getCharName(char) {
      if (char.vanguard && char.vanguard.name) return char.vanguard.name;
      if (char.name) return char.name;
      return null;
    },

    _buildManaConfig(char, level, legacyChar) {
      const manaTemplate = MANA_BY_LEVEL[Math.min(5, level)] || MANA_BY_LEVEL[0];
      const legacy = legacyChar || null;
      const manaConfig = {
        max: (char && char.maxMana != null) ? char.maxMana : ((legacy && legacy.maxMana != null) ? legacy.maxMana : manaTemplate.max),
        regen: (char && char.manaRegen != null) ? char.manaRegen : ((legacy && legacy.manaRegen != null) ? legacy.manaRegen : manaTemplate.regen)
      };
      const rawCurrent = (char && char.mana != null) ? char.mana : ((legacy && legacy.mana != null) ? legacy.mana : null);
      manaConfig.current = (rawCurrent != null)
        ? Math.min(rawCurrent, manaConfig.max)
        : manaConfig.max;
      return manaConfig;
    },

    _getRoleMetaFromName(name) {
      if (RoleRuntime && typeof RoleRuntime.deriveRoleMeta === 'function') {
        return RoleRuntime.deriveRoleMeta(name);
      }
      const raw = String(name || '').trim();
      if (!raw) return { roleId: 'UNKNOWN', roleVariant: 'base' };
      return { roleId: raw, roleVariant: 'base' };
    },

    _registerManaPool(poolId, manaConfig, meta) {
      if (manaConfig) {
        var finalMeta = meta || {};
        var resolvedMana = this.assetDeckAdapter && typeof this.assetDeckAdapter.resolveManaMax === 'function'
          ? this.assetDeckAdapter.resolveManaMax(this.assetModifiers, poolId, manaConfig.max, {
            ownerId: finalMeta.ownerId,
            casterSlot: finalMeta.casterSlot || 'default',
            casterRoleId: finalMeta.casterRoleId || finalMeta.casterName || null,
            teamTags: Number(manaConfig.max || 0) > 0
              ? ['team', finalMeta.casterSlot, finalMeta.casterRoleId, finalMeta.casterName, finalMeta.ownerName].filter(Boolean)
              : [finalMeta.casterSlot, finalMeta.casterRoleId, finalMeta.casterName, finalMeta.ownerName].filter(Boolean)
          })
          : null;
        var maxMana = resolvedMana && resolvedMana.max != null ? resolvedMana.max : manaConfig.max;
        var sourceTargetKeys = [
          finalMeta.casterRoleId,
          finalMeta.casterName,
          finalMeta.casterSlot,
          finalMeta.ownerName
        ].map(function(item) { return String(item == null ? '' : item).trim().toLowerCase(); }).filter(Boolean);
        var hasExplicitManaTarget = !!(resolvedMana && Array.isArray(resolvedMana.sources) && resolvedMana.sources.some(function(source) {
          if (!source) return false;
          if (source.ownerId != null || source.owner) return true;
          var tags = Array.isArray(source.targetTags) ? source.targetTags : [];
          return tags.some(function(tag) {
            tag = String(tag || '').trim().toLowerCase();
            return tag && sourceTargetKeys.indexOf(tag) >= 0;
          });
        }));
        if (Number(manaConfig.max || 0) <= 0 && resolvedMana && Number(resolvedMana.baseMax || 0) <= 0 && !hasExplicitManaTarget) {
          maxMana = 0;
          if (resolvedMana.flatDelta) resolvedMana = Object.assign({}, resolvedMana, { max: 0, flatDelta: 0 });
        }
        var assetMaxDelta = resolvedMana && Number(resolvedMana.flatDelta || 0) > 0
          ? Number(resolvedMana.flatDelta || 0)
          : 0;
        var currentMana = (manaConfig.current != null)
          ? Number(manaConfig.current || 0) + assetMaxDelta
          : maxMana;
        this.manaPools.set(poolId, {
          id: poolId,
          ownerId: finalMeta.ownerId,
          ownerName: finalMeta.ownerName || null,
          casterName: finalMeta.casterName || finalMeta.ownerName || null,
          casterSlot: finalMeta.casterSlot || 'default',
          casterRoleId: finalMeta.casterRoleId || finalMeta.casterName || null,
          current: Math.min(currentMana, maxMana),
          max: maxMana,
          regen: (manaConfig.regen != null) ? manaConfig.regen : 1,
          baseMax: manaConfig.max,
          assetMax: resolvedMana || null
        });
        this._addOwnerManaPool(finalMeta.ownerId != null ? finalMeta.ownerId : poolId, poolId, finalMeta.isDefault !== false);
      }
    },

    _registerSkillList(ownerId, ownerName, ownerType, skillList, casterName, meta) {
      const entries = this._normalizeSkillEntries(skillList);

      for (const entry of entries) {
        this._registerSingleSkill(ownerId, ownerName, ownerType, entry.key, casterName, entry, meta || {});
      }
    },

    _registerEntity(ownerId, ownerName, ownerType, skillList, manaConfig, meta) {
      // Mana 池
      var finalMeta = meta || {};
      var poolId = finalMeta.manaPoolId || this._makeManaPoolId(ownerId, finalMeta.casterSlot || 'default', finalMeta.seat || null);
      this._registerManaPool(poolId, manaConfig, {
        ownerId: ownerId,
        ownerName: ownerName,
        casterName: ownerName,
        casterSlot: finalMeta.casterSlot || 'default',
        casterRoleId: ownerName,
        isDefault: true
      });

      // 展开技能，支持 ["grand_wish"]、{ grand_wish: 2 }、[{ key, level }]
      const entries = this._normalizeSkillEntries(skillList);

      for (const entry of entries) {
        this._registerSingleSkill(ownerId, ownerName, ownerType, entry.key, ownerName, entry, {
          casterSlot: finalMeta.casterSlot || 'default',
          casterRoleId: ownerName,
          manaPoolId: poolId
        });
      }
    },

    _normalizeSkillEntries(skillList) {
      if (Array.isArray(skillList)) {
        return skillList.map(function(entry) {
          if (entry && typeof entry === 'object') {
            return {
              key: String(entry.key || entry.skillKey || '').trim(),
              level: entry.level != null ? entry.level : entry.rank
            };
          }
          return { key: String(entry || '').trim(), level: null };
        }).filter(function(entry) { return entry.key; });
      }
      return Object.keys(skillList || {}).map(function(key) {
        const value = skillList[key];
        if (value && typeof value === 'object') {
          return {
            key: String(value.key || value.skillKey || key).trim(),
            level: value.level != null ? value.level : value.rank
          };
        }
        return { key: String(key || '').trim(), level: value };
      }).filter(function(entry) { return entry.key; });
    },

    _registerSingleSkill(ownerId, ownerName, ownerType, skillKey, casterName, entry, meta) {
      const requestedLevel = entry && entry.level != null ? entry.level : null;
      const catalog = lookupSkill(skillKey, requestedLevel);
      if (!catalog) {
        console.warn('[SkillSystem] 未知技能 key:', skillKey, '(owner:', ownerName, ')');
        return;
      }
      const canonicalSkillKey = catalog.skillKey || catalog.key || skillKey;

      const activation = catalog.activation || ACTIVATION.PASSIVE;
      const initialActive = (activation === ACTIVATION.PASSIVE);
      const ownerRole = this._getRoleMetaFromName(ownerName);
      const casterRole = this._getRoleMetaFromName(casterName || ownerName);
      const finalMeta = meta || {};
      const casterSlot = finalMeta.casterSlot || 'default';
      const manaPoolId = finalMeta.manaPoolId || this._resolveManaPoolId(ownerId) || ownerId;
      const uniquePrefix = casterSlot === 'default' || casterSlot === 'vanguard'
        ? String(ownerId)
        : String(ownerId) + '_' + casterSlot;

      const skill = {
        uniqueId: uniquePrefix + '_' + canonicalSkillKey,
        ownerId: ownerId,
        ownerName: ownerName,
        ownerType: ownerType,
        casterName: casterName || ownerName,
        casterSlot: casterSlot,
        manaPoolId: manaPoolId,
        roleId: ownerRole.roleId,
        roleVariant: ownerRole.roleVariant,
        casterRoleId: finalMeta.casterRoleId || casterRole.roleId,
        casterRoleVariant: casterRole.roleVariant,
        skillKey: canonicalSkillKey,
        icon: catalog.icon || null,
        effect: catalog.effect,
        system: catalog.system || null,
        kind: catalog.kind || catalog.effect,
        level: catalog.level || null,
        maxLevel: catalog.maxLevel || null,
        targetMode: catalog.targetMode || null,
        matrix: Array.isArray(catalog.matrix) ? catalog.matrix.slice(0, 3) : null,
        lockChance: catalog.lockChance || 0,
        special: Object.assign({}, catalog.special || {}),
        activation: activation,
        manaCost: catalog.manaCost || 0,
        baseManaCost: catalog.manaCost || 0,
        power: catalog.power || 0,
        active: initialActive,
        description: catalog.description || '',
        target: catalog.target || null,
        trigger: catalog.trigger || null,
        cooldown: catalog.cooldown || 0,
        currentCooldown: 0,
        handCard: catalog.handCard !== false,
        showAsPassiveCard: catalog.showAsPassiveCard === true,
        pendingImplementation: catalog.pendingImplementation === true,
        // 整局使用次数限制
        usesPerGame: catalog.usesPerGame || 0,  // 0 = 无限制
        gameUsesRemaining: catalog.usesPerGame || 0,  // 剩余可用次数
        usesPerStreet: catalog.usesPerStreet || 0
      };

      var assetLevelEntries = this._getAssetSkillLevelEntries(canonicalSkillKey);
      if (assetLevelEntries.length) {
        skill.assetCards = assetLevelEntries.map(function(entry) {
          return {
            cardId: entry.cardId || null,
            skillKey: entry.skillKey || canonicalSkillKey,
            level: entry.level || skill.level || null,
            type: 'skill_level'
          };
        });
        skill._assetLevelSource = skill.assetCards;
      }

      this.skills.set(skill.uniqueId, skill);
      this._log('SKILL_REGISTERED', {
        owner: ownerName, caster: casterName, key: canonicalSkillKey, effect: skill.effect,
        activation: activation, level: skill.level, system: skill.system, kind: skill.kind, power: skill.power,
        manaPoolId: skill.manaPoolId, casterSlot: skill.casterSlot, casterRoleId: skill.casterRoleId
      });
    }
  });
})(typeof window !== 'undefined' ? window : global);

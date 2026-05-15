(function (global) {
  'use strict';

  var modules = global.AceSkillSystemModules = global.AceSkillSystemModules || {};
  var SkillSystem = modules.SkillSystem;
  if (!SkillSystem) throw new Error('AceSkillSystemModules.SkillSystem is not loaded');

  global.SkillSystem = SkillSystem;
  global.SkillSystem.ACTIVATION = modules.ACTIVATION;
  global.SkillSystem.EFFECT = modules.EFFECT;
  global.SkillSystem.SKILL_SYSTEM = modules.SKILL_SYSTEM;
  global.SkillSystem.SKILL_KIND = modules.SKILL_KIND;
  global.SkillSystem.UNIVERSAL_SKILL_LEVELS = modules.UNIVERSAL_SKILL_LEVELS;
  global.SkillSystem.UNIVERSAL_SKILLS = modules.UNIVERSAL_SKILLS;
  global.SkillSystem.ROLE_SKILLS = modules.ROLE_SKILLS;
  global.SkillSystem.MANA_BY_LEVEL = modules.MANA_BY_LEVEL;
  global.SkillSystem.lookupSkill = modules.lookupSkill;
  global.SkillSystem.calculateSlots = modules.calculateSlots;
  global.SkillSystem.canLearnSkill = modules.canLearnSkill;
  global.SkillSystem.deriveSkillsFromAttrs = modules.deriveSkillsFromAttrs;

  if (!global.AceSkillSystemReady || typeof global.AceSkillSystemReady.then !== 'function') {
    global.AceSkillSystemReady = Promise.resolve(global.SkillSystem);
  }
})(typeof window !== 'undefined' ? window : global);

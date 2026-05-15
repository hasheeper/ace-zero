/* global PokerAIModules */

/**
 * Core Module: PokerAI facade.
 *
 * The implementation is split under core/ai/. This file keeps the legacy
 * window.PokerAI API stable for existing game and UI callers.
 */
(function(global) {
  'use strict';

  var modules = global.PokerAIModules || {};
  var CardUtils = modules.CardUtils || {};
  var Profiles = modules.Profiles || {};
  var UtilityScorer = modules.UtilityScorer || {};
  var StateModels = modules.StateModels || {};
  var OpponentModelModule = modules.OpponentModel || {};
  var ActionAI = modules.ActionAI || {};
  var SkillAI = modules.SkillAI || null;
  var NpcRoleDirector = global.NpcRoleDirector || {
    shouldUseSkill: function(input, fallback) {
      return fallback(input);
    }
  };
  var PokerAI = ActionAI.PokerAI;

  if (!PokerAI) {
    throw new Error('[PokerAI] Missing core/ai/action-ai.js before core/poker-ai.js');
  }

  global.PokerAI = PokerAI;
  global.PokerAI.ACTIONS = UtilityScorer.ACTIONS;
  global.PokerAI.RISK_PROFILES = Profiles.RISK_PROFILES;
  global.PokerAI.DIFFICULTY_PROFILES = Profiles.DIFFICULTY_PROFILES;
  global.PokerAI.EMOTION_PROFILES = Profiles.EMOTION_PROFILES;
  global.PokerAI.evaluateHandStrength = CardUtils.evaluateHandStrength;
  global.PokerAI.evaluatePreflopStrength = CardUtils.evaluatePreflopStrength;
  global.PokerAI.cardToString = CardUtils.cardToString;
  global.PokerAI.SkillAI = SkillAI;
  global.PokerAI.NpcRoleDirector = NpcRoleDirector;
  global.PokerAI.BehaviorFSM = StateModels.BehaviorFSM;
  global.PokerAI.FSM_STATES = StateModels.FSM_STATES;
  global.PokerAI.BossScript = StateModels.BossScript;
  global.PokerAI.BOSS_PHASES = StateModels.BOSS_PHASES;
  global.PokerAI.OpponentModel = OpponentModelModule.OpponentModel;
})(typeof window !== 'undefined' ? window : global);

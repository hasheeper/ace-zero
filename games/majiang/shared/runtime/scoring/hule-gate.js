(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.AceMahjongCreateRuntimeHuleGateHelpers = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const BONUS_HUPAI_NAMES = Object.freeze(['ドラ', '赤ドラ', '裏ドラ', '抜きドラ']);

  function createRuntimeHuleGateHelpers(options = {}) {
    const allowHule = typeof options.allowHule === 'function'
      ? options.allowHule
      : null;

    function getHupaiFlag(hupai) {
      return typeof hupai === 'object'
        ? Boolean(
            hupai.lizhi
            || hupai.yifa
            || hupai.qianggang
            || hupai.lingshang
            || hupai.haidi
            || hupai.tianhu
          )
        : Boolean(hupai);
    }

    function safeAllowHule(rule, shoupai, tileCode, zhuangfeng, menfeng, hupai, nengRong) {
      if (!allowHule || !shoupai) return false;
      try {
        return Boolean(allowHule(
          rule,
          shoupai,
          tileCode,
          zhuangfeng,
          menfeng,
          getHupaiFlag(hupai),
          nengRong
        ));
      } catch (error) {
        return false;
      }
    }

    function getShibariMinYakuHan(customRuleConfig = {}) {
      const rawValue = customRuleConfig && typeof customRuleConfig === 'object'
        ? customRuleConfig.shibariMinYakuHan
        : null;
      const minYakuHan = Number(rawValue);
      return [1, 2, 4].includes(minYakuHan) ? minYakuHan : 1;
    }

    function isBonusHupaiName(name) {
      return BONUS_HUPAI_NAMES.includes(String(name || '').trim());
    }

    function getNonBonusYakuHan(result) {
      if (!result || typeof result !== 'object') return 0;
      if (Number(result.damanguan || 0) > 0) return Number.POSITIVE_INFINITY;
      const hupaiList = Array.isArray(result.hupai) ? result.hupai : [];
      return hupaiList.reduce((sum, item) => {
        if (!item || isBonusHupaiName(item.name)) return sum;
        const fanshu = Number(item.fanshu);
        if (!Number.isFinite(fanshu) || fanshu <= 0) return sum;
        return sum + fanshu;
      }, 0);
    }

    function satisfiesShibari(result, minYakuHan = 1) {
      const resolvedMin = [1, 2, 4].includes(Number(minYakuHan))
        ? Number(minYakuHan)
        : 1;
      if (!result || typeof result !== 'object') return false;
      if (Number(result.damanguan || 0) > 0) return true;
      return getNonBonusYakuHan(result) >= resolvedMin;
    }

    return {
      getHupaiFlag,
      safeAllowHule,
      getShibariMinYakuHan,
      isBonusHupaiName,
      getNonBonusYakuHan,
      satisfiesShibari
    };
  }

  return createRuntimeHuleGateHelpers;
});

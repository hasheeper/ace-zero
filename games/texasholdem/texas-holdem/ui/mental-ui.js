/**
 * Mental Pressure UI - 心理压制系统UI
 * 显示直觉胜率器、定力条、状态图标
 */

/* global MentalPressureSystem */

(function(global) {
  'use strict';

  class MentalUI {
    constructor(mentalSystem) {
      this.mental = mentalSystem;
    }

    /**
     * 创建直觉胜率器元素
     */
    createEquityGauge(playerId, trueEquity) {
      const equityData = this.mental.calculateDisplayEquity(playerId, trueEquity);
      const gauge = document.createElement('div');
      gauge.className = 'equity-gauge';
      gauge.dataset.mode = equityData.mode;

      if (equityData.mode === 'truth') {
        // 真理模式
        gauge.innerHTML = `
          <span class="equity-precise">${(equityData.value * 100).toFixed(2)}%</span>
          <span class="truth-icon">✦</span>
        `;
      } else {
        // 正常模式
        const conf = equityData.confidence > 80 ? 'high' :
                     equityData.confidence > 40 ? 'medium' : 'low';
        gauge.dataset.confidence = conf;

        const minPct = Math.round(equityData.min * 100);
        const maxPct = Math.round(equityData.max * 100);

        gauge.innerHTML = `
          <span class="equity-range">${minPct}% ~ ${maxPct}%</span>
          <span class="confidence-icon">${equityData.icon}</span>
        `;
      }

      return gauge;
    }

    /**
     * 更新胜率显示
     */
    updateEquityDisplay(playerId, trueEquity, container) {
      const oldGauge = container.querySelector('.equity-gauge');
      const newGauge = this.createEquityGauge(playerId, trueEquity);

      if (oldGauge) {
        oldGauge.replaceWith(newGauge);
      } else {
        container.appendChild(newGauge);
      }
    }
  }

  global.MentalUI = MentalUI;

})(typeof window !== 'undefined' ? window : global);

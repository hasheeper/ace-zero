    (function () {
      var runtimePayload = null;
      var localTestPayload = null;
      var LOCAL_TEST_PAYLOAD_URL = './local-test-payload.json';

      function readInlinePayload() {
        try {
          var node = document.getElementById('ace0-raw');
          if (!node) return null;
          var raw = (node.textContent || node.innerText || '').trim();
          var placeholder = '$' + '1'; 
          if (!raw || raw === placeholder) return null; 
          return JSON.parse(raw);
        } catch (e) { return null; }
      }

      function getPayload() {
        if (runtimePayload && typeof runtimePayload === 'object') return runtimePayload;
        return readInlinePayload() || localTestPayload;
      }

      function loadLocalTestPayload() {
        if (localTestPayload) return Promise.resolve(localTestPayload);
        return fetch(LOCAL_TEST_PAYLOAD_URL, { cache: 'no-cache' })
          .then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.json();
          })
          .then(function (payload) {
            localTestPayload = payload && typeof payload === 'object' ? payload : null;
            return localTestPayload;
          })
          .catch(function () {
            return null;
          });
      }

      var PHASE_NAMES = ['I', 'II', 'III', 'IV'];
      var TIME_PHASE_NAMES = ['晨相', '昼相', '暮相', '夜相'];
      var TIME_PHASE_SUBS = ['DAWN', 'NOON', 'DUSK', 'NIGHT'];
      // 由低到高展示：底锈(0) → 下街(1) → 中市(2) → 上庭(3)
      var STRATA_ORDER  = ['THE_RUST', 'THE_STREET', 'THE_EXCHANGE', 'THE_COURT'];
      var STRATA_NAMES  = ['底锈', '下街', '中市', '上庭'];
      var STRATA_SUBS   = ['RUST', 'STREET', 'EXCHANGE', 'COURT'];

      function resolveLayerIndex(loc) {
        if (!loc) return -1;
        var idx = Number(loc.layerIndex);
        if (isFinite(idx) && idx >= 0 && idx <= 3) return idx;
        var key = String(loc.layer || '').trim().toUpperCase();
        var pos = STRATA_ORDER.indexOf(key);
        return pos >= 0 ? pos : -1;
      }

      // 行高度：未激活 26px，激活 56px（与 CSS 同步）
      var STRATA_ROW_INACTIVE = 26;
      var STRATA_ROW_ACTIVE   = 48;

      function renderStrataTracker(loc, fromLoc, shifted) {
        var container = document.getElementById('ui-tracker-strata');
        if (!container) return;
        if (!loc) { container.style.display = 'none'; return; }
        container.style.display = '';

        var cIdx = resolveLayerIndex(loc);
        var pIdx = resolveLayerIndex(fromLoc);
        var siteText = (loc.site || '').trim();

        // HTML 顺序为 [3,2,1,0]：上庭→底锈，目标层之上有 (3 - cIdx) 个未激活层
        // 锚点宽 9px，需上移 4.5px 才能视觉居中于目标行
        var STRATA_ANCHOR_HALF = 4.5;
        var layersAbove = Math.max(0, 3 - cIdx);
        var topPx = (layersAbove * STRATA_ROW_INACTIVE) + (STRATA_ROW_ACTIVE / 2) - STRATA_ANCHOR_HALF;

        var anchor = document.getElementById('strata-anchor');
        var rows = container.querySelectorAll('.vault-row');
        var themeColor = '#c2b173';

        rows.forEach(function (row) {
          var idx = parseInt(row.getAttribute('data-idx'), 10);
          var siteEl = row.querySelector('.vault-site');
          row.classList.remove('is-active', 'is-prev');
          if (siteEl) siteEl.textContent = '';

          if (idx === cIdx) {
            row.classList.add('is-active');
            themeColor = row.getAttribute('data-color') || themeColor;
            if (siteEl && siteText) siteEl.textContent = '· ' + siteText;
          } else if (shifted && idx === pIdx) {
            row.classList.add('is-prev');
          }
        });

        if (anchor) {
          anchor.style.top = topPx + 'px';
          anchor.style.borderColor = themeColor;
          var afterColor = themeColor;
          // 把 ::after 内点也改色：通过设置自身 background 让 inset:1px 的子层透出
          anchor.style.setProperty('--strata-rust', afterColor);
        }
      }

      function renderMiniTimeTracker(config) {
        var container = document.getElementById('ui-tracker-time');
        if (!config) { container.style.display = 'none'; return; }
        container.style.display = '';
        
        document.getElementById('mini-time-title').textContent = config.titleLabel || '--';
        var axis = document.getElementById('mini-time-axis');
        axis.innerHTML = '';
        var rawIdx = Number(config.activeIndex);
        var cIdx = isFinite(rawIdx) ? rawIdx : -1;

        var lens = document.createElement('div');
        lens.className = 'gauge-lens' + ((cIdx >= 0 && cIdx < 4) ? '' : ' is-hidden');
        if (cIdx >= 0 && cIdx < 4) {
          lens.style.transform = 'translateX(' + (cIdx * 100) + '%)';
        }
        axis.appendChild(lens);

        for(var i=0; i<4; i++) {
           var step = document.createElement('div');
           var stateCls = (i === cIdx) ? 'is-active' : '';
           step.className = 'phase-step ' + stateCls;

           var lbl = document.createElement('div');
           lbl.className = 'phase-label';
           lbl.textContent = TIME_PHASE_NAMES[i];

           var sub = document.createElement('div');
           sub.className = 'phase-sub';
           sub.textContent = TIME_PHASE_SUBS[i];

           step.appendChild(lbl);
           step.appendChild(sub);
           axis.appendChild(step);
        }
      }

      function renderMajorNodeTracker(container, config) {
        if (!container || !config) return;
        container.style.display = '';
        container.innerHTML = '';
        
        var dayEl = document.createElement('div');
        dayEl.className = 'node-identifier';
        var daySub = document.createElement('span');
        daySub.textContent = config.subtitle || (config.collapsed ? 'NODE CLEARED' : 'PHASE ENGAGED');
        var dayTitle = document.createElement('div');
        dayTitle.textContent = config.titleLabel;
        dayEl.appendChild(daySub);
        dayEl.appendChild(dayTitle);
        container.appendChild(dayEl);

        var pipe = document.createElement('div');
        pipe.className = 'reactor-pipeline';

        if (config.collapsed === true) {
          pipe.classList.add('is-collapsed');

          var collapsedSvgNS = 'http://www.w3.org/2000/svg';
          var collapsedSvg = document.createElementNS(collapsedSvgNS, 'svg');
          collapsedSvg.setAttribute('viewBox', '0 0 300 60');
          collapsedSvg.setAttribute('preserveAspectRatio', 'none');
          collapsedSvg.setAttribute('class', 'pipeline-curve-layer');

          var collapsedPath = document.createElementNS(collapsedSvgNS, 'path');
          collapsedPath.setAttribute('d', 'M 8 30 C 78 18, 122 42, 150 30 C 178 18, 222 42, 292 30');
          collapsedPath.setAttribute('class', 'pipeline-trough');
          collapsedSvg.appendChild(collapsedPath);

          var collapsedBus = document.createElementNS(collapsedSvgNS, 'path');
          collapsedBus.setAttribute('d', 'M 8 30 C 78 18, 122 42, 150 30 C 178 18, 222 42, 292 30');
          collapsedBus.setAttribute('class', 'pipeline-curve');
          collapsedSvg.appendChild(collapsedBus);

          var collapsedFlow = document.createElementNS(collapsedSvgNS, 'path');
          collapsedFlow.setAttribute('d', 'M 8 30 C 78 18, 122 42, 150 30 C 178 18, 222 42, 292 30');
          collapsedFlow.setAttribute('class', 'pipeline-flow is-hidden');
          collapsedFlow.setAttribute('pathLength', '100');
          collapsedSvg.appendChild(collapsedFlow);

          pipe.appendChild(collapsedSvg);

          var collapsedNode = document.createElement('div');
          collapsedNode.className = 'socket-node is-active';
          if (config.isDanger) collapsedNode.classList.add('is-danger');

          var collapsedText = document.createElement('div');
          collapsedText.className = 'socket-text';
          collapsedText.textContent = config.collapsedLabel || 'CL';
          collapsedNode.appendChild(collapsedText);
          pipe.appendChild(collapsedNode);

          container.appendChild(pipe);
          return;
        }

        var svgNS = 'http://www.w3.org/2000/svg';
        var svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('viewBox', '0 0 300 60');
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.setAttribute('class', 'pipeline-curve-layer');

        var pathD = 'M 8 30 C 54 14, 70 44, 106 30 C 142 16, 158 44, 194 30 C 230 16, 246 44, 292 30';

        var trough = document.createElementNS(svgNS, 'path');
        trough.setAttribute('d', pathD);
        trough.setAttribute('class', 'pipeline-trough');
        svg.appendChild(trough);

        var bus = document.createElementNS(svgNS, 'path');
        bus.setAttribute('d', pathD);
        bus.setAttribute('class', 'pipeline-curve');
        svg.appendChild(bus);

        var cIdx = Number(config.activeIndex);
        var normalizedIdx = isFinite(cIdx) ? cIdx : -1;
        var flow = document.createElementNS(svgNS, 'path');
        flow.setAttribute('d', pathD);
        flow.setAttribute('class', 'pipeline-flow');
        flow.setAttribute('pathLength', '100');
        if (normalizedIdx < 0) {
          flow.classList.add('is-hidden');
        } else {
          var progress = (normalizedIdx / (PHASE_NAMES.length - 1)) * 100;
          flow.style.strokeDasharray = progress + ' 100';
        }
        svg.appendChild(flow);
        pipe.appendChild(svg);

        for (var i = 0; i < 4; i++) {
          var node = document.createElement('div');
          node.className = 'socket-node';
          if (i < normalizedIdx) node.classList.add('is-past');
          else if (i === normalizedIdx) {
            node.classList.add('is-active');
            if (config.isDanger) node.classList.add('is-danger');
          }

          var txt = document.createElement('div');
          txt.className = 'socket-text';
          txt.textContent = PHASE_NAMES[i];
          node.appendChild(txt);
          pipe.appendChild(node);
        }
        container.appendChild(pipe);
      }

      function nonZeroEntries(map) { return Object.entries(map || {}).filter(function (e) { return Number(e[1]) !== 0; }); }

      function syncSummaryMarquee() {
        var summaryEl = document.getElementById('ui-summary');
        if (!summaryEl) return;
        var track = summaryEl.querySelector('.summary-track');
        var inline = track && track.querySelector('.summary-inline');
        if (!track || !inline) return;

        summaryEl.classList.remove('is-marquee');
        summaryEl.style.removeProperty('--summary-shift');
        summaryEl.style.removeProperty('--summary-duration');
        summaryEl.style.removeProperty('--summary-gap');

        var available = Math.max(0, summaryEl.clientWidth - 12);
        var needed = Math.max(0, inline.scrollWidth - available);
        if (needed <= 8) return;

        var gap = 36;
        summaryEl.style.setProperty('--summary-gap', gap + 'px');
        summaryEl.style.setProperty('--summary-shift', inline.scrollWidth + 'px');
        summaryEl.style.setProperty('--summary-duration', Math.max(12, inline.scrollWidth / 20) + 's');
        summaryEl.classList.add('is-marquee');
      }

      function render(data) {
        if (!data) return;

        var clock = data.worldClock;
        if (clock) {
            renderMiniTimeTracker({
                titleLabel: 'DAY ' + String(Number(clock.day) || 1).padStart(2, '0'),
                activeIndex: Number(clock.phaseIndex)
            });
        }

        renderStrataTracker(data.worldLocation, data.fromWorldLocation, !!data.worldLayerShifted);
        if (data.worldLayerShifted) {
            document.getElementById('ui-log-port').classList.add('has-shift');
        }

        var nodeContainer = document.getElementById('ui-tracker-node');
        var dDay = String(data.toNodeIndex || data.fromNodeIndex || '--').padStart(2, '0');
        if (data.type === 'node_advance') {
            document.getElementById('ui-top-status').textContent = '周期清算';
            renderMajorNodeTracker(nodeContainer, { titleLabel: 'NODE ' + dDay, activeIndex: Number(data.toPhaseIndex) || 0 });
        } else {
            if (Number(data.advancedPhases) > 0) {
                 document.getElementById('ui-top-status').textContent = '节点推演';
                 document.getElementById('ui-log-port').classList.add('has-shift');
            }
            renderMajorNodeTracker(nodeContainer, { titleLabel: 'NODE ' + dDay, activeIndex: Number(data.toPhaseIndex) || -1 });
        }

        var indicator = document.getElementById('ui-indicator');
        if (
            indicator &&
            (
                (data.fundsDelta && data.fundsDelta < 0) ||
                (data.debtDelta && data.debtDelta > 0) ||
                (data.majorDebtDelta && data.majorDebtDelta > 0)
            )
        ) {
            indicator.style.background = 'var(--warn-red)';
            indicator.style.boxShadow = '0 0 8px var(--warn-red)';
        }
        var summaryEl = document.getElementById('ui-summary');
        if (data.summary) {
            var summaryHtml = data.summary.replace(/(交锋点|契约点|休整点|事件点|红章|处刑|闪崩|总务|债蚀|承灾)/g, function(m){
                return '<strong>' + m + '</strong>';
            });
            summaryEl.innerHTML = '<span class="summary-track"><span class="summary-inline">' + summaryHtml + '</span><span class="summary-inline" aria-hidden="true">' + summaryHtml + '</span></span>';
            syncSummaryMarquee();
        }

        var lootList = document.getElementById('ui-loot-list');
        var listHtml = ''; var hasLoot = false; var oIdx = 0;
        if (Number(data.fundsDelta) !== 0) {
            var fundsTone = data.fundsDelta > 0 ? 'c-gold' : 'c-danger';
            var fundsValueTone = data.fundsDelta > 0 ? 'c-gold' : 'c-danger';
            hasLoot=true; listHtml += `<div class="loot-card ${fundsTone}" style="--i:${oIdx++}"><div class="loot-left"><div class="loot-icon">✦</div><div class="loot-name">持有筹码<span>(FUNDS)</span></div></div><div class="loot-val ${fundsValueTone}">${data.fundsDelta>0?'+':''}${data.fundsDelta}</div></div>`;
        }
        if (Number(data.assetsDelta) !== 0) {
            var assetsValueTone = data.assetsDelta > 0 ? 'c-gold' : 'c-danger';
            hasLoot=true; listHtml += `<div class="loot-card" style="--i:${oIdx++};color:#b0b5be"><div class="loot-left"><div class="loot-icon" style="color:#b0b5be"><svg class="loot-icon-asset" viewBox="0 0 14 14" aria-hidden="true"><rect x="2.5" y="2.5" width="9" height="9" transform="rotate(45 7 7)" fill="none" stroke="#b0b5be" stroke-width="1.2"></rect><rect x="4.4" y="4.4" width="5.2" height="5.2" transform="rotate(45 7 7)" fill="none" stroke="rgba(176,181,190,0.65)" stroke-width="1"></rect></svg></div><div class="loot-name">资产估值<span>(ASSETS)</span></div></div><div class="loot-val ${assetsValueTone}">${data.assetsDelta>0?'+':''}${data.assetsDelta}</div></div>`;
        }
        if (Number(data.debtDelta) !== 0) {
            var debtValueTone = data.debtDelta > 0 ? 'c-debt-value' : 'c-gold';
            hasLoot=true; listHtml += `<div class="loot-card c-debt-accent" style="--i:${oIdx++}"><div class="loot-left"><div class="loot-icon is-debt">⊕</div><div class="loot-name">普通债务<span>(DEBT)</span></div></div><div class="loot-val ${debtValueTone}">${data.debtDelta>0?'+':''}${data.debtDelta}</div></div>`;
        }
        if (Number(data.majorDebtDelta) !== 0) {
            hasLoot=true; listHtml += `<div class="loot-card c-major-debt" style="--i:${oIdx++}"><div class="loot-left"><div class="loot-icon">⛨</div><div class="loot-name">主线大债<span>(MAJOR DEBT)</span></div></div><div class="loot-val ${data.majorDebtDelta>0?'is-neg':'is-pos'}">${data.majorDebtDelta>0?'+':''}${data.majorDebtDelta}</div></div>`;
        }
        if (data.manaDelta && typeof data.manaDelta === 'object') {
            nonZeroEntries(data.manaDelta).forEach(function (e) {
                hasLoot=true; listHtml += `<div class="loot-card c-mana" style="--i:${oIdx++}"><div class="loot-left"><div class="loot-icon">❖</div><div class="loot-name">储能 · ${e[0]}<span>(MANA)</span></div></div><div class="loot-val ${e[1]>0?'is-pos':'is-neg'}">${e[1]>0?'+':''}${e[1]}</div></div>`;
            });
        }
        var dict = {'combat':'限定交锋点','contract':'限定契约点','rest':'限定休整点','event':'限定事件点'};
        nonZeroEntries(data.limitedDelta||{}).forEach(function(e){ 
            var delta = Number(e[1]) || 0;
            hasLoot=true; listHtml+=`<div class="loot-card c-${e[0]}" style="--i:${oIdx++}"><div class="loot-left"><div class="loot-icon"><div class="shape-core"></div></div><div class="loot-name">${dict[e[0]]||e[0]}<span>(LIMITED)</span></div></div><div class="loot-val ${delta>0?'is-pos':'is-neg'}">${delta>0?'+':''}${delta}</div></div>`;
        });
        nonZeroEntries(data.reserveDelta||{}).forEach(function(e){ 
            var delta = Number(e[1]) || 0;
            hasLoot=true; var n = dict[e[0]]?('常驻'+dict[e[0]].slice(2)):e[0];
            listHtml+=`<div class="loot-card c-${e[0]}" style="--i:${oIdx++}"><div class="loot-left"><div class="loot-icon"><div class="shape-core"></div></div><div class="loot-name">${n}<span>(RESERVE)</span></div></div><div class="loot-val ${delta>0?'is-pos':'is-neg'}">${delta>0?'+':''}${delta}</div></div>`;
        });

        if (hasLoot) { lootList.innerHTML = listHtml; } else { lootList.style.display = 'none'; }
        buildRoutePanel(data);
      }

      function resolveAce0Api() {
        var targets = [window, window.parent, window.top];
        for(var i=0; i<targets.length; i++) {
           try{ if(targets[i] && targets[i].ACE0Plugin) return targets[i].ACE0Plugin; }catch(e){}
        }
        return null;
      }

      function buildRoutePanel(data) {
        var panel = document.getElementById('ui-route-panel');
        var opts = Array.isArray(data && data.routeOptions) ? data.routeOptions : [];
        if (!data || !data.needsRouteChoice || !opts.length) { panel.style.display = 'none'; return; }
        
        var labels = data.routeOptionLabels || {};
        panel.style.display = ''; panel.className = 'route-panel';
        while (panel.firstChild) panel.removeChild(panel.firstChild);

        var titleEl = document.createElement('div');
        titleEl.className = 'route-panel-title'; titleEl.textContent = 'FATE SELECTION';
        panel.appendChild(titleEl);

        var listEl = document.createElement('div');
        listEl.className = 'route-options';
        
        opts.forEach(function (nodeId) {
          var info = labels[nodeId] || {};
          var btn = document.createElement('div');
          btn.className = 'route-btn'; btn.setAttribute('data-node-id', String(nodeId));
          
          var lbl = document.createElement('span'); lbl.className = 'route-btn-label'; lbl.textContent = String(info.label || nodeId);
          var sub = document.createElement('span'); sub.className = 'route-btn-subtitle'; sub.textContent = String(info.subtitle || '');
          var arr = document.createElement('div'); arr.className = 'route-btn-arrow';
          
          btn.appendChild(lbl); btn.appendChild(sub); btn.appendChild(arr);
          btn.addEventListener('click', function() { handleRouteClick(btn, data); });
          listEl.appendChild(btn);
        });
        panel.appendChild(listEl);
        
        var hint = document.createElement('div'); hint.className = 'route-panel-hint'; hint.id = 'ui-route-hint'; hint.textContent = '>> 锚定命运分支 <<';
        panel.appendChild(hint);
        
        syncRoutePanelStateToMvu(data);
      }

      async function syncRoutePanelStateToMvu(data) {
        var api = resolveAce0Api();
        if (!api || typeof api.getEraVars !== 'function') return;
        try {
          var v = await api.getEraVars(); var act = v && v.world && v.world.act; if(!act) return;
          var cNi = Number(act.nodeIndex)||0; var stage = String(act.stage||'');
          if (stage !== 'route' || cNi > Number(data.toNodeIndex||0)) {
            lockRoutePanel(act.route_history ? act.route_history[Number(data.toNodeIndex)||0] : null, cNi);
          }
        } catch(e){}
      }

      function lockRoutePanel(chosenId, nodeIndex) {
        var panel = document.getElementById('ui-route-panel'); if(!panel) return;
        panel.querySelectorAll('.route-btn').forEach(function(b) {
           if(chosenId && b.getAttribute('data-node-id') === chosenId) b.classList.add('is-chosen');
           else b.classList.add('is-disabled');
        });
        var hint = document.getElementById('ui-route-hint');
        if(hint) { hint.textContent = '契约已确立 // NODE ' + String(nodeIndex||0).padStart(2,'0'); hint.className = 'route-panel-hint success'; }
      }

      async function handleRouteClick(btn, data) {
        var nId = btn.getAttribute('data-node-id'); if(!nId) return;
        var api = resolveAce0Api();
        if (!api || !api.chooseActRoute) { document.getElementById('ui-route-hint').textContent = '! API 缺失'; return; }
        
        btn.classList.add('is-chosen');
        document.querySelectorAll('.route-btn').forEach(function(e){ if(e!==btn) e.classList.add('is-disabled'); });
        
        try {
           var r = await api.chooseActRoute(nId);
           var hint = document.getElementById('ui-route-hint');
           if(r && r.ok) { hint.textContent = '命运已推演 ✓'; hint.className = 'route-panel-hint success'; }
           else { 
               btn.classList.remove('is-chosen'); 
               document.querySelectorAll('.route-btn').forEach(function(e){ e.classList.remove('is-disabled'); });
               hint.textContent = '! 驳回: ' + (r.reason||'Error'); 
           }
        } catch(e) { document.getElementById('ui-route-hint').textContent = '! 系统拒绝'; }
      }

      function applyPayload(payload) {
        runtimePayload = payload && typeof payload === 'object' ? payload : null;
        render(getPayload());
        scheduleContentReports();
      }

      function bootWithFallback() {
        var payload = getPayload();
        if (payload) {
          render(payload);
          scheduleContentReports();
          return;
        }
        loadLocalTestPayload().then(function (fallbackPayload) {
          if (!runtimePayload && fallbackPayload) {
            render(fallbackPayload);
          }
          scheduleContentReports();
        });
      }

      function measureContentHeight() {
        var widget = document.querySelector('.mech-widget');
        if (!widget) return 400;
        var rect = widget.getBoundingClientRect();
        var height = Math.max(widget.offsetHeight || 0, rect ? rect.height : 0);
        return Math.ceil(height);
      }

      function reportContentSize() {
        requestAnimationFrame(function () {
          var height = measureContentHeight();
          try {
            if (window.parent && window.parent !== window) {
              window.parent.postMessage({
                type: 'acezero-act-result-size',
                height: height
              }, '*');
            }
          } catch (_) {}
        });
      }

      function scheduleContentReports() {
        reportContentSize();
        setTimeout(reportContentSize, 80);
        setTimeout(reportContentSize, 240);
        setTimeout(reportContentSize, 600);
      }

      window.addEventListener('message', function (event) {
        var msg = event && event.data;
        if (!msg || msg.type !== 'acezero-act-result-data') return;
        applyPayload(msg.payload);
      });

      bootWithFallback();
      window.addEventListener('resize', syncSummaryMarquee);
      window.addEventListener('resize', reportContentSize);
      if (window.ResizeObserver) {
        var observedWidget = document.querySelector('.mech-widget');
        new ResizeObserver(reportContentSize).observe(observedWidget || document.body);
      }
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ type: 'acezero-act-result-request' }, '*');
        }
      } catch (_) {}
    })();

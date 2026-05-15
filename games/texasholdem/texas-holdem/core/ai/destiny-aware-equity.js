/* global Hand */

/**
 * Module: DestinyAwareEquity
 *
 * Estimates how public fortune/curse forces bias the next public card without
 * looking at hidden opponent cards or the real deck order.
 */
(function(global) {
  'use strict';

  var modules = global.PokerAIModules || (global.PokerAIModules = {});
  var register = modules.register || function(name, value) {
    modules[name] = value;
    return value;
  };

  var SUIT_MAP = { 0: 's', 1: 'h', 2: 'c', 3: 'd' };
  var RANK_MAP = {
    1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7',
    8: '8', 9: '9', 10: 'T', 11: 'J', 12: 'Q', 13: 'K'
  };

  var FULL_DECK = [];
  for (var suit = 0; suit < 4; suit++) {
    for (var rank = 1; rank <= 13; rank++) {
      FULL_DECK.push({ rank: rank, suit: suit });
    }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeId(id) {
    return id == null ? '' : String(id);
  }

  function normalizeCard(card) {
    if (!card) return null;
    var rank = Number(card.rank);
    var suit = Number(card.suit);
    if (!rank || suit < 0 || suit > 3) return null;
    return { rank: rank, suit: suit };
  }

  function normalizeCards(cards) {
    if (!Array.isArray(cards)) return [];
    var out = [];
    for (var i = 0; i < cards.length; i++) {
      var card = normalizeCard(cards[i]);
      if (card) out.push(card);
    }
    return out;
  }

  function cardKey(card) {
    return Number(card.rank) * 4 + Number(card.suit);
  }

  function cardToSolverString(card) {
    return RANK_MAP[card.rank] + SUIT_MAP[card.suit];
  }

  function removeKnownCards(cards) {
    var used = Object.create(null);
    for (var i = 0; i < cards.length; i++) {
      var card = normalizeCard(cards[i]);
      if (card) used[cardKey(card)] = true;
    }
    return FULL_DECK.filter(function(card) {
      return !used[cardKey(card)];
    });
  }

  function deterministicPick(deck, count, seed) {
    var pool = deck.slice();
    var picked = [];
    if (count <= 0) return picked;
    for (var i = 0; i < count && pool.length > 0; i++) {
      var idx = Math.abs((seed * 17 + i * 23 + picked.length * 7) % pool.length);
      picked.push(pool.splice(idx, 1)[0]);
    }
    return picked;
  }

  function normalizeForce(force) {
    if (!force) return null;
    var type = force.type || force.kind || force.effect;
    if (type === 'royal_decree' || type === 'miracle' || type === 'lucky_find' ||
        type === 'absolution' || type === 'benediction') {
      type = 'fortune';
    }
    if (type !== 'fortune' && type !== 'curse' && type !== 'backlash') return null;
    var power = Math.max(0, Number(force.effectivePower != null ? force.effectivePower : force.power || 0));
    if (power <= 0) return null;
    return {
      ownerId: force.ownerId,
      ownerName: force.ownerName || null,
      targetId: force.targetId != null ? force.targetId : null,
      protectId: force.protectId != null ? force.protectId : null,
      type: type,
      power: power,
      skillKey: force.skillKey || null
    };
  }

  function collectDestinyForces(forces) {
    if (!Array.isArray(forces)) return [];
    var out = [];
    for (var i = 0; i < forces.length; i++) {
      var force = normalizeForce(forces[i]);
      if (force) out.push(force);
    }
    return out;
  }

  function collectKnownCardsByPlayer(input) {
    var known = Object.create(null);
    var direct = input && input.knownCardsByPlayer;
    if (direct) {
      var ids = Object.keys(direct);
      for (var i = 0; i < ids.length; i++) {
        var cards = normalizeCards(direct[ids[i]]);
        if (cards.length >= 2) known[normalizeId(ids[i])] = cards.slice(0, 2);
      }
    }

    var memory = input && input.scoutMemory;
    if (Array.isArray(memory)) {
      for (var mi = 0; mi < memory.length; mi++) {
        var entry = memory[mi];
        if (!entry || entry.targetId == null) continue;
        if (entry.infoLevel !== 'perfect') continue;
        var knownCards = normalizeCards(entry.knownCards);
        if (knownCards.length >= 2) known[normalizeId(entry.targetId)] = knownCards.slice(0, 2);
      }
    }
    return known;
  }

  function buildVisiblePlayers(input, knownByPlayer) {
    var heroId = input.heroId;
    var heroKey = normalizeId(heroId);
    var players = [];
    var source = Array.isArray(input.players) ? input.players
      : (Array.isArray(input.visiblePlayers) ? input.visiblePlayers : []);

    for (var i = 0; i < source.length; i++) {
      var p = source[i];
      if (!p || p.folded || p.isActive === false) continue;
      var key = normalizeId(p.id);
      var cards = [];
      if (key === heroKey) {
        cards = normalizeCards(input.holeCards);
      } else if (knownByPlayer[key]) {
        cards = knownByPlayer[key].slice(0, 2);
      } else if ((p.cardsKnown || p.knownCards) && Array.isArray(p.cards)) {
        cards = normalizeCards(p.cards).slice(0, 2);
      }
      players.push({
        id: p.id,
        name: p.name || null,
        cards: cards,
        known: cards.length >= 2
      });
    }

    if (!players.some(function(p) { return normalizeId(p.id) === heroKey; })) {
      players.unshift({
        id: heroId,
        name: input.playerName || 'AI',
        cards: normalizeCards(input.holeCards),
        known: true
      });
    }

    return players;
  }

  function evaluateShowdown(players, boardCards, heroId) {
    var boardStr = boardCards.map(cardToSolverString);
    var handObjects = [];
    var scores = Object.create(null);
    var ranks = Object.create(null);

    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      if (!p.cards || p.cards.length < 2) continue;
      try {
        var hand = Hand.solve(p.cards.map(cardToSolverString).concat(boardStr));
        handObjects.push({ playerId: p.id, hand: hand });
      } catch (e) {
        // Ignore invalid sampled hands.
      }
    }

    if (handObjects.length === 0) return null;
    var winners = Hand.winners(handObjects.map(function(entry) { return entry.hand; }));
    var winnerIds = [];
    for (var wi = 0; wi < handObjects.length; wi++) {
      if (winners.indexOf(handObjects[wi].hand) >= 0) winnerIds.push(handObjects[wi].playerId);
    }

    var heroWins = winnerIds.some(function(id) { return normalizeId(id) === normalizeId(heroId); });
    var heroEquity = heroWins ? 1 / Math.max(1, winnerIds.length) : 0;

    for (var hi = 0; hi < handObjects.length; hi++) {
      var item = handObjects[hi];
      var rank = item.hand.rank || 0;
      ranks[normalizeId(item.playerId)] = rank;
      if (winnerIds.indexOf(item.playerId) >= 0) {
        scores[normalizeId(item.playerId)] = clamp(62 + rank * 2, 55, 82);
      } else {
        scores[normalizeId(item.playerId)] = clamp(22 + rank * 4, 10, 48);
      }
    }

    return { heroEquity: heroEquity, scores: scores, ranks: ranks, winnerIds: winnerIds };
  }

  function scoreForces(showdown, forces, heroId) {
    var destinyScore = 0;
    var heroKey = normalizeId(heroId);
    var enemyFortunePressure = 0;
    var beneficiaryPower = Object.create(null);

    for (var i = 0; i < forces.length; i++) {
      var f = forces[i];
      if (f.type === 'fortune') {
        var ownerKey = normalizeId(f.ownerId);
        var ownerScore = showdown.scores[ownerKey] || 0;
        destinyScore += f.power * (ownerScore / 100);
        beneficiaryPower[ownerKey] = (beneficiaryPower[ownerKey] || 0) + f.power;
        if (ownerKey !== heroKey) enemyFortunePressure += f.power;
      } else if (f.type === 'curse') {
        var targetKey = normalizeId(f.targetId);
        if (!targetKey) continue;
        destinyScore += f.power * (1 - ((showdown.scores[targetKey] || 0) / 100));
      } else if (f.type === 'backlash') {
        var backlashTarget = normalizeId(f.targetId);
        if (!backlashTarget) continue;
        destinyScore += f.power * (1 - ((showdown.scores[backlashTarget] || 0) / 100));
      }
    }

    var mainBeneficiaryId = null;
    var maxPower = 0;
    var ids = Object.keys(beneficiaryPower);
    for (var bi = 0; bi < ids.length; bi++) {
      if (beneficiaryPower[ids[bi]] > maxPower) {
        maxPower = beneficiaryPower[ids[bi]];
        mainBeneficiaryId = ids[bi];
      }
    }

    return {
      destinyScore: destinyScore,
      enemyFortunePressure: enemyFortunePressure,
      mainBeneficiaryId: mainBeneficiaryId
    };
  }

  function buildSamplePlayers(players, candidateCard, boardCards, sampleDeck, seed) {
    var unknown = players.filter(function(p) { return !p.cards || p.cards.length < 2; });
    var futureBoardNeeded = Math.max(0, 5 - (boardCards.length + 1));
    var needed = unknown.length * 2 + futureBoardNeeded;
    var picked = deterministicPick(sampleDeck, needed, seed);
    if (picked.length < needed) return null;

    var cursor = 0;
    var samplePlayers = players.map(function(p) {
      if (p.cards && p.cards.length >= 2) {
        return { id: p.id, name: p.name, cards: p.cards.slice(0, 2) };
      }
      var cards = [picked[cursor++], picked[cursor++]];
      return { id: p.id, name: p.name, cards: cards };
    });
    var futureBoard = boardCards.concat([candidateCard]);
    for (var i = 0; i < futureBoardNeeded; i++) {
      futureBoard.push(picked[cursor++]);
    }
    return { players: samplePlayers, board: futureBoard };
  }

  function estimate(input) {
    input = input || {};
    var notes = [];
    var phase = String(input.phase || '').toLowerCase();
    if (phase === 'river' || phase === 'showdown') {
      return { applied: false, reason: 'terminal_phase', notes: ['terminal_phase'] };
    }
    if (typeof Hand === 'undefined') {
      return { applied: false, reason: 'missing_hand_solver', notes: ['missing_hand_solver'] };
    }

    var heroId = input.heroId != null ? input.heroId : input.playerId;
    var heroCards = normalizeCards(input.holeCards);
    var boardCards = normalizeCards(input.boardCards);
    if (heroId == null || heroCards.length < 2 || boardCards.length >= 5) {
      return { applied: false, reason: 'insufficient_cards', notes: ['insufficient_cards'] };
    }

    var forces = collectDestinyForces(input.forces || input.visibleForces || input.forceSnapshot);
    if (forces.length === 0) {
      return { applied: false, reason: 'no_destiny_forces', notes: ['no_destiny_forces'] };
    }

    var knownByPlayer = collectKnownCardsByPlayer(input);
    var players = buildVisiblePlayers(input, knownByPlayer);
    var heroKey = normalizeId(heroId);
    var heroPlayer = players.find(function(p) { return normalizeId(p.id) === heroKey; });
    if (!heroPlayer || !heroPlayer.cards || heroPlayer.cards.length < 2) {
      return { applied: false, reason: 'missing_hero', notes: ['missing_hero'] };
    }

    var knownCards = heroCards.concat(boardCards);
    for (var pi = 0; pi < players.length; pi++) {
      if (normalizeId(players[pi].id) !== heroKey && players[pi].cards && players[pi].cards.length >= 2) {
        knownCards = knownCards.concat(players[pi].cards);
      }
    }
    var nextCardDeck = removeKnownCards(knownCards);
    if (nextCardDeck.length === 0) {
      return { applied: false, reason: 'empty_deck', notes: ['empty_deck'] };
    }

    var maxMs = input.maxMs != null ? Math.max(1, Number(input.maxMs)) : 18;
    var startedAt = Date.now ? Date.now() : 0;
    var samplesPerCandidate = input.samplesPerCandidate != null
      ? Math.max(1, Number(input.samplesPerCandidate))
      : (boardCards.length === 0 ? 3 : 5);
    var candidateLimit = input.candidateLimit != null
      ? Math.max(1, Math.min(nextCardDeck.length, Number(input.candidateLimit)))
      : nextCardDeck.length;
    var candidateResults = [];

    for (var ci = 0; ci < nextCardDeck.length && candidateResults.length < candidateLimit; ci++) {
      if (candidateResults.length >= 8 && Date.now && Date.now() - startedAt > maxMs) {
        notes.push('partial_timeout');
        break;
      }

      var candidateCard = nextCardDeck[ci];
      var sampleKnown = knownCards.concat([candidateCard]);
      var sampleDeck = removeKnownCards(sampleKnown);
      var heroEquityTotal = 0;
      var destinyTotal = 0;
      var validSamples = 0;
      var enemyFortuneTotal = 0;
      var beneficiaryTotals = Object.create(null);

      for (var si = 0; si < samplesPerCandidate; si++) {
        var built = buildSamplePlayers(players, candidateCard, boardCards, sampleDeck, ci * 101 + si * 37 + 13);
        if (!built) continue;
        var showdown = evaluateShowdown(built.players, built.board, heroId);
        if (!showdown) continue;
        var forceScore = scoreForces(showdown, forces, heroId);
        heroEquityTotal += showdown.heroEquity;
        destinyTotal += forceScore.destinyScore;
        enemyFortuneTotal += forceScore.enemyFortunePressure;
        if (forceScore.mainBeneficiaryId) {
          beneficiaryTotals[forceScore.mainBeneficiaryId] =
            (beneficiaryTotals[forceScore.mainBeneficiaryId] || 0) + 1;
        }
        validSamples++;
      }

      if (validSamples > 0) {
        candidateResults.push({
          card: candidateCard,
          heroEquity: heroEquityTotal / validSamples,
          destinyScore: destinyTotal / validSamples,
          enemyFortunePressure: enemyFortuneTotal / validSamples,
          beneficiaryTotals: beneficiaryTotals
        });
      }
    }

    if (candidateResults.length === 0) {
      return { applied: false, reason: 'no_valid_samples', notes: ['no_valid_samples'] };
    }

    var physicalTotal = 0;
    var maxScore = -Infinity;
    var enemyFortunePressure = 0;
    var mainBeneficiaryCounts = Object.create(null);
    for (var ri = 0; ri < candidateResults.length; ri++) {
      var result = candidateResults[ri];
      physicalTotal += result.heroEquity;
      maxScore = Math.max(maxScore, result.destinyScore);
      enemyFortunePressure += result.enemyFortunePressure;
      var beneficiaryIds = Object.keys(result.beneficiaryTotals);
      for (var bj = 0; bj < beneficiaryIds.length; bj++) {
        var bid = beneficiaryIds[bj];
        mainBeneficiaryCounts[bid] = (mainBeneficiaryCounts[bid] || 0) + result.beneficiaryTotals[bid];
      }
    }

    var temperature = input.temperature != null ? Math.max(1, Number(input.temperature)) : 8;
    var weightTotal = 0;
    var destinyEquityTotal = 0;
    for (var wi = 0; wi < candidateResults.length; wi++) {
      var weight = Math.exp((candidateResults[wi].destinyScore - maxScore) / temperature);
      weightTotal += weight;
      destinyEquityTotal += candidateResults[wi].heroEquity * weight;
    }

    var physicalEquity = physicalTotal / candidateResults.length;
    var destinyEquity = weightTotal > 0 ? destinyEquityTotal / weightTotal : physicalEquity;
    var delta = clamp(destinyEquity - physicalEquity, -0.30, 0.30);
    destinyEquity = clamp(physicalEquity + delta, 0.01, 0.99);

    var mainBeneficiaryId = null;
    var mainCount = 0;
    var countIds = Object.keys(mainBeneficiaryCounts);
    for (var mi = 0; mi < countIds.length; mi++) {
      if (mainBeneficiaryCounts[countIds[mi]] > mainCount) {
        mainCount = mainBeneficiaryCounts[countIds[mi]];
        mainBeneficiaryId = countIds[mi];
      }
    }

    notes.unshift('destiny_forces:' + forces.length);
    return {
      applied: true,
      physicalEquity: physicalEquity,
      destinyEquity: destinyEquity,
      delta: delta,
      enemyFortunePressure: enemyFortunePressure / candidateResults.length,
      mainBeneficiaryId: mainBeneficiaryId,
      candidateCount: candidateResults.length,
      samplesPerCandidate: samplesPerCandidate,
      notes: notes
    };
  }

  register('DestinyAwareEquity', {
    estimate: estimate,
    _test: {
      collectDestinyForces: collectDestinyForces,
      collectKnownCardsByPlayer: collectKnownCardsByPlayer,
      buildVisiblePlayers: buildVisiblePlayers
    }
  });
})(typeof window !== 'undefined' ? window : global);

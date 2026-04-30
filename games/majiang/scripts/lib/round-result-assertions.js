'use strict';

function getRoundResult(snapshot) {
  return snapshot && snapshot.roundResult ? snapshot.roundResult : null;
}

function getPrimaryResult(roundResult) {
  if (!roundResult) return null;
  if (roundResult.result && typeof roundResult.result === 'object') {
    return roundResult.result;
  }
  if (Array.isArray(roundResult.results) && roundResult.results[0]) {
    return roundResult.results[0];
  }
  return null;
}

function getResultYakuNames(result) {
  const hupai = result && Array.isArray(result.hupai) ? result.hupai : [];
  return hupai.map((item) => item && item.name).filter(Boolean);
}

function compareScoreMap(actualScores, expectedScores, errors) {
  if (!expectedScores || typeof expectedScores !== 'object') return;
  const actual = actualScores && typeof actualScores === 'object' ? actualScores : {};
  Object.keys(expectedScores).forEach((seatKey) => {
    const actualValue = Number(actual[seatKey]);
    const expectedValue = Number(expectedScores[seatKey]);
    if (actualValue !== expectedValue) {
      errors.push(`scores.${seatKey} expected ${expectedValue} but got ${actualValue}`);
    }
  });
}

function compareYakuNames(actualNames, expectedNames, label, errors) {
  if (!Array.isArray(expectedNames)) return;
  expectedNames.forEach((name) => {
    if (!actualNames.includes(name)) {
      errors.push(`${label} missing ${name}; actual=${actualNames.join(', ')}`);
    }
  });
}

function compareWinner(actualWinner, expectedWinner, index, errors) {
  if (!actualWinner) {
    errors.push(`winners[${index}] expected a winner entry but got null`);
    return;
  }

  if (expectedWinner.winnerSeat && actualWinner.winnerSeat !== expectedWinner.winnerSeat) {
    errors.push(`winners[${index}].winnerSeat expected ${expectedWinner.winnerSeat} but got ${actualWinner.winnerSeat}`);
  }
  if (Object.prototype.hasOwnProperty.call(expectedWinner, 'fromSeat')
      && actualWinner.fromSeat !== expectedWinner.fromSeat) {
    errors.push(`winners[${index}].fromSeat expected ${expectedWinner.fromSeat} but got ${actualWinner.fromSeat}`);
  }
  if (Object.prototype.hasOwnProperty.call(expectedWinner, 'haidi')) {
    const actualHaidi = Number(actualWinner.haidi || 0);
    if (actualHaidi !== Number(expectedWinner.haidi || 0)) {
      errors.push(`winners[${index}].haidi expected ${expectedWinner.haidi} but got ${actualHaidi}`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(expectedWinner, 'tianhu')) {
    const actualTianhu = Number(actualWinner.tianhu || 0);
    if (actualTianhu !== Number(expectedWinner.tianhu || 0)) {
      errors.push(`winners[${index}].tianhu expected ${expectedWinner.tianhu} but got ${actualTianhu}`);
    }
  }

  const result = actualWinner.result || null;
  if (Object.prototype.hasOwnProperty.call(expectedWinner, 'fanshu')) {
    const actualFanshu = result ? Number(result.fanshu) : null;
    if (actualFanshu !== Number(expectedWinner.fanshu)) {
      errors.push(`winners[${index}].fanshu expected ${expectedWinner.fanshu} but got ${actualFanshu}`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(expectedWinner, 'fu')) {
    const actualFu = result ? Number(result.fu) : null;
    if (actualFu !== Number(expectedWinner.fu)) {
      errors.push(`winners[${index}].fu expected ${expectedWinner.fu} but got ${actualFu}`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(expectedWinner, 'defen')) {
    const actualDefen = result ? Number(result.defen) : null;
    if (actualDefen !== Number(expectedWinner.defen)) {
      errors.push(`winners[${index}].defen expected ${expectedWinner.defen} but got ${actualDefen}`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(expectedWinner, 'damanguan')) {
    const actualDamanguan = result ? Number(result.damanguan || 0) : null;
    if (actualDamanguan !== Number(expectedWinner.damanguan)) {
      errors.push(`winners[${index}].damanguan expected ${expectedWinner.damanguan} but got ${actualDamanguan}`);
    }
  }
  compareYakuNames(getResultYakuNames(result), expectedWinner.hupaiNamesIncludes, `winners[${index}].hupaiNamesIncludes`, errors);
}

function compareRoundResultExpected(snapshot, expected = {}) {
  const errors = [];
  const roundResult = getRoundResult(snapshot);
  const primaryResult = getPrimaryResult(roundResult);

  if (expected.phase && snapshot.phase !== expected.phase) {
    errors.push(`phase expected ${expected.phase} but got ${snapshot.phase}`);
  }
  if (Object.prototype.hasOwnProperty.call(expected, 'changbang')) {
    const actualChangbang = roundResult ? Number(roundResult.changbang || 0) : 0;
    if (actualChangbang !== Number(expected.changbang || 0)) {
      errors.push(`changbang expected ${expected.changbang} but got ${actualChangbang}`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(expected, 'lizhibang')) {
    const actualLizhibang = roundResult ? Number(roundResult.lizhibang || 0) : 0;
    if (actualLizhibang !== Number(expected.lizhibang || 0)) {
      errors.push(`lizhibang expected ${expected.lizhibang} but got ${actualLizhibang}`);
    }
  }
  if (expected.turnSeat && snapshot.turnSeat !== expected.turnSeat) {
    errors.push(`turnSeat expected ${expected.turnSeat} but got ${snapshot.turnSeat}`);
  }
  if (expected.roundResultType && (!roundResult || roundResult.type !== expected.roundResultType)) {
    errors.push(`roundResult.type expected ${expected.roundResultType} but got ${roundResult ? roundResult.type : 'null'}`);
  }
  if (Object.prototype.hasOwnProperty.call(expected, 'roundResultReason')) {
    const actualReason = roundResult ? roundResult.reason : null;
    if (actualReason !== expected.roundResultReason) {
      errors.push(`roundResult.reason expected ${expected.roundResultReason} but got ${actualReason}`);
    }
  }
  if (expected.winnerSeat && (!roundResult || roundResult.winnerSeat !== expected.winnerSeat)) {
    errors.push(`winnerSeat expected ${expected.winnerSeat} but got ${roundResult ? roundResult.winnerSeat : 'null'}`);
  }
  if (Object.prototype.hasOwnProperty.call(expected, 'fromSeat')) {
    const actualFromSeat = roundResult ? roundResult.fromSeat : null;
    if (actualFromSeat !== expected.fromSeat) {
      errors.push(`fromSeat expected ${expected.fromSeat} but got ${actualFromSeat}`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(expected, 'haidi')) {
    const actualHaidi = roundResult ? Number(roundResult.haidi || 0) : 0;
    if (actualHaidi !== Number(expected.haidi || 0)) {
      errors.push(`haidi expected ${expected.haidi} but got ${actualHaidi}`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(expected, 'tianhu')) {
    const actualTianhu = roundResult ? Number(roundResult.tianhu || 0) : 0;
    if (actualTianhu !== Number(expected.tianhu || 0)) {
      errors.push(`tianhu expected ${expected.tianhu} but got ${actualTianhu}`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(expected, 'winnerCount')) {
    const actualWinnerCount = roundResult ? Number(roundResult.winnerCount || 0) : 0;
    if (actualWinnerCount !== Number(expected.winnerCount || 0)) {
      errors.push(`winnerCount expected ${expected.winnerCount} but got ${actualWinnerCount}`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(expected, 'multiHule')) {
    const actualMultiHule = roundResult ? Boolean(roundResult.multiHule) : false;
    if (actualMultiHule !== Boolean(expected.multiHule)) {
      errors.push(`multiHule expected ${expected.multiHule} but got ${actualMultiHule}`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(expected, 'baojiaSeat')) {
    const actualBaojiaSeat = roundResult ? roundResult.baojiaSeat : null;
    if (actualBaojiaSeat !== expected.baojiaSeat) {
      errors.push(`baojiaSeat expected ${expected.baojiaSeat} but got ${actualBaojiaSeat}`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(expected, 'baojiaYaku')) {
    const actualBaojiaYaku = roundResult ? roundResult.baojiaYaku : null;
    if (actualBaojiaYaku !== expected.baojiaYaku) {
      errors.push(`baojiaYaku expected ${expected.baojiaYaku} but got ${actualBaojiaYaku}`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(expected, 'fanshu')) {
    const actualFanshu = primaryResult ? Number(primaryResult.fanshu) : null;
    if (actualFanshu !== Number(expected.fanshu)) {
      errors.push(`fanshu expected ${expected.fanshu} but got ${actualFanshu}`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(expected, 'fu')) {
    const actualFu = primaryResult ? Number(primaryResult.fu) : null;
    if (actualFu !== Number(expected.fu)) {
      errors.push(`fu expected ${expected.fu} but got ${actualFu}`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(expected, 'defen')) {
    const actualDefen = primaryResult ? Number(primaryResult.defen) : null;
    if (actualDefen !== Number(expected.defen)) {
      errors.push(`defen expected ${expected.defen} but got ${actualDefen}`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(expected, 'damanguan')) {
    const actualDamanguan = primaryResult ? Number(primaryResult.damanguan || 0) : null;
    if (actualDamanguan !== Number(expected.damanguan)) {
      errors.push(`damanguan expected ${expected.damanguan} but got ${actualDamanguan}`);
    }
  }

  compareYakuNames(getResultYakuNames(primaryResult), expected.hupaiNamesIncludes, 'hupaiNamesIncludes', errors);
  compareScoreMap(roundResult && roundResult.scores, expected.scores, errors);

  ['tenpaiSeats', 'notenSeats', 'revealedHands', 'fenpei'].forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(expected, field)) return;
    const actualValue = roundResult ? roundResult[field] : null;
    if (expected[field] === null) {
      if (actualValue !== null) {
        errors.push(`${field} expected null but got ${JSON.stringify(actualValue)}`);
      }
      return;
    }
    if (!Array.isArray(expected[field])) return;
    const normalizedActualValue = Array.isArray(actualValue) ? actualValue : [];
    if (JSON.stringify(normalizedActualValue) !== JSON.stringify(expected[field])) {
      errors.push(`${field} expected ${JSON.stringify(expected[field])} but got ${JSON.stringify(normalizedActualValue)}`);
    }
  });

  if (Object.prototype.hasOwnProperty.call(expected, 'dealerContinues')) {
    const actualDealerContinues = roundResult ? Boolean(roundResult.dealerContinues) : false;
    if (actualDealerContinues !== Boolean(expected.dealerContinues)) {
      errors.push(`dealerContinues expected ${expected.dealerContinues} but got ${actualDealerContinues}`);
    }
  }

  if (Array.isArray(expected.winners)) {
    const actualWinners = roundResult && Array.isArray(roundResult.winners) ? roundResult.winners : [];
    if (actualWinners.length !== expected.winners.length) {
      errors.push(`winners.length expected ${expected.winners.length} but got ${actualWinners.length}`);
    }
    expected.winners.forEach((expectedWinner, index) => {
      compareWinner(actualWinners[index] || null, expectedWinner, index, errors);
    });
  }

  return errors;
}

module.exports = {
  getRoundResult,
  getPrimaryResult,
  getResultYakuNames,
  compareRoundResultExpected
};

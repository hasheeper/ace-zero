'use strict';

const fs = require('fs');
const path = require('path');
const rankerApi = require('./lib/hard-mortal-ranker-dataset');

function parseArgs(argv = []) {
  const args = {
    help: false,
    dataset: rankerApi.DEFAULT_DATASET_PATH,
    out: null,
    includeStateDetails: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--dataset') {
      args.dataset = String(argv[index + 1] || '').trim() || args.dataset;
      index += 1;
      continue;
    }
    if (token === '--out') {
      args.out = String(argv[index + 1] || '').trim() || null;
      index += 1;
      continue;
    }
    if (token === '--include-state-details') {
      args.includeStateDetails = true;
    }
  }

  return args;
}

function printHelp() {
  console.log('Usage: node games/majiang/scripts/evaluate-hard-mortal-ranker-baseline.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --dataset <path>             Input JSONL dataset. Default: /tmp/h13-mortal-ranker-dataset.jsonl');
  console.log('  --out <path>                 Optional output JSON path.');
  console.log('  --include-state-details      Include per-state picks in output.');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const datasetPath = path.resolve(args.dataset);
  const rows = rankerApi.readJsonl(datasetPath);
  const report = rankerApi.evaluateRankerDatasetRows(rows, {
    includeStateDetails: args.includeStateDetails
  });
  const output = JSON.stringify({
    dataset: datasetPath,
    ...report
  }, null, 2);
  if (args.out) {
    fs.writeFileSync(path.resolve(args.out), output.concat('\n'), 'utf8');
  }
  console.log(output);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  main
};

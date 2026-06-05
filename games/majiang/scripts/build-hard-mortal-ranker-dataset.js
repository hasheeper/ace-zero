'use strict';

const fs = require('fs');
const path = require('path');
const rankerApi = require('./lib/hard-mortal-ranker-dataset');

function parseReportList(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseArgs(argv = []) {
  const args = {
    help: false,
    reports: [rankerApi.DEFAULT_REPORT_PATH],
    out: rankerApi.DEFAULT_DATASET_PATH,
    summaryOut: null,
    stdout: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--report') {
      args.reports = parseReportList(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === '--reports') {
      args.reports = parseReportList(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === '--add-report') {
      args.reports.push(...parseReportList(argv[index + 1]));
      index += 1;
      continue;
    }
    if (token === '--out') {
      args.out = String(argv[index + 1] || '').trim() || args.out;
      index += 1;
      continue;
    }
    if (token === '--summary-out') {
      args.summaryOut = String(argv[index + 1] || '').trim() || null;
      index += 1;
      continue;
    }
    if (token === '--stdout') {
      args.stdout = true;
    }
  }

  if (!args.reports.length) args.reports = [rankerApi.DEFAULT_REPORT_PATH];
  return args;
}

function printHelp() {
  console.log('Usage: node games/majiang/scripts/build-hard-mortal-ranker-dataset.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --report <path[,path]>      Input benchmark report(s). Default: /tmp/h12-clean-hard-vs-mortal-real.json');
  console.log('  --reports <path[,path]>     Alias for --report.');
  console.log('  --add-report <path[,path]>  Append additional report(s).');
  console.log('  --out <path>                Output JSONL dataset. Default: /tmp/h13-mortal-ranker-dataset.jsonl');
  console.log('  --summary-out <path>        Optional summary JSON path.');
  console.log('  --stdout                    Also print JSONL rows to stdout.');
}

function readReport(filePath) {
  const resolved = path.resolve(filePath);
  return {
    path: resolved,
    report: JSON.parse(fs.readFileSync(resolved, 'utf8'))
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const reports = args.reports.map(readReport);
  const dataset = rankerApi.buildRankerDatasetFromReports(reports);
  rankerApi.assertCompactDatasetRows(dataset.candidateRows);

  if (args.out) {
    rankerApi.writeJsonl(args.out, dataset.candidateRows);
  }
  if (args.summaryOut) {
    fs.writeFileSync(path.resolve(args.summaryOut), JSON.stringify(dataset.summary, null, 2).concat('\n'), 'utf8');
  }
  if (args.stdout) {
    process.stdout.write(rankerApi.serializeJsonl(dataset.candidateRows));
  }

  console.log(JSON.stringify({
    out: args.out ? path.resolve(args.out) : null,
    summaryOut: args.summaryOut ? path.resolve(args.summaryOut) : null,
    summary: dataset.summary
  }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  readReport,
  main
};

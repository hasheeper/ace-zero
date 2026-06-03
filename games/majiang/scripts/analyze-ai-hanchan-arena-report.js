'use strict';

const fs = require('fs');
const path = require('path');

const arenaApi = require('./benchmark-ai-hanchan-arena');

function parseArgs(argv) {
  const args = {
    report: '/tmp/ai-hanchan-arena-mixed-1000.json',
    section: 'auto',
    json: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--report') {
      args.report = String(argv[index + 1] || '').trim() || args.report;
      index += 1;
      continue;
    }
    if (token === '--section') {
      args.section = String(argv[index + 1] || '').trim() || args.section;
      index += 1;
      continue;
    }
    if (token === '--json') {
      args.json = true;
      continue;
    }
  }
  return args;
}

function printHelp() {
  console.log('Usage: node games/majiang/scripts/analyze-ai-hanchan-arena-report.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --report <path>                  Arena JSON report. Default: /tmp/ai-hanchan-arena-mixed-1000.json.');
  console.log('  --section <auto|mixed|mirror>    Section to render. Default: auto.');
  console.log('  --json                           Print compact panel JSON instead of text.');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function resolveReportVariants(report) {
  if (Array.isArray(report && report.variants) && report.variants.length) {
    return report.variants.map((variant) => ({
      id: variant.id,
      label: variant.label || variant.id,
      difficulty: variant.difficulty || null,
      description: variant.description || null
    }));
  }
  if (Array.isArray(report && report.variantOrder) && report.variantOrder.length) {
    return report.variantOrder.map((id) => ({ id, label: id }));
  }
  return arenaApi.resolveVariants([]);
}

function panelJsonForSummary(summary, variants) {
  return (variants || []).reduce((result, variant) => {
    const stats = summary && summary.variantStats ? summary.variantStats[variant.id] : null;
    if (stats) result[variant.id] = arenaApi.buildVariantRecordPanel(stats);
    return result;
  }, {});
}

function renderMixed(report, variants, args) {
  if (!report.mixed || !report.mixed.summary) return null;
  if (args.json) {
    return {
      mode: 'mixed',
      status: report.status || null,
      completedMatches: report.completedMatches || report.mixed.summary.totals.completedMatches || 0,
      matches: report.matches || report.mixed.summary.totals.matches || 0,
      totals: report.mixed.summary.totals,
      variants: panelJsonForSummary(report.mixed.summary, variants)
    };
  }
  const label = `mixed ${report.completedMatches || report.mixed.summary.totals.completedMatches || 0}/${report.matches || report.mixed.summary.totals.matches || 0}`;
  return arenaApi.formatArenaSummary(label, report.mixed.summary, variants);
}

function renderMirror(report, variants, args) {
  if (!report.mirror) return null;
  if (args.json) {
    return Object.keys(report.mirror).reduce((result, variantId) => {
      const section = report.mirror[variantId];
      const variant = variants.find((entry) => entry.id === variantId) || { id: variantId };
      result[variantId] = {
        totals: section && section.summary ? section.summary.totals : null,
        variants: section && section.summary ? panelJsonForSummary(section.summary, [variant]) : {}
      };
      return result;
    }, {});
  }
  return Object.keys(report.mirror).map((variantId) => {
    const section = report.mirror[variantId];
    const variant = variants.find((entry) => entry.id === variantId) || { id: variantId };
    return arenaApi.formatArenaSummary(`mirror:${variantId}`, section.summary, [variant]);
  }).join('\n');
}

function analyzeReport(report, args = {}) {
  const variants = resolveReportVariants(report);
  if (args.section === 'mixed') return renderMixed(report, variants, args);
  if (args.section === 'mirror') return renderMirror(report, variants, args);
  if (report.mixed) return renderMixed(report, variants, args);
  if (report.mirror) return renderMirror(report, variants, args);
  throw new Error('Report does not contain a mixed or mirror arena section.');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  const report = readJson(args.report);
  const output = analyzeReport(report, args);
  console.log(typeof output === 'string' ? output : JSON.stringify(output, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  analyzeReport
};

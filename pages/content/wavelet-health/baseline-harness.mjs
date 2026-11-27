import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { buildProbe } from './browser-harness.mjs';
import { summarizeBaseline } from './report.mjs';

const here = path => fileURLToPath(new URL(path, import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: here('..'), encoding: 'utf8' }).trim();
const errorMessage = error => (error instanceof Error ? error.message : String(error));

export async function runBaseline({ provider, reportFile, selectorFile, entry, bundleName, baseline, run }) {
  const reportPath = here(reportFile);
  const report = {
    schemaVersion: 1,
    mode: 'extractor_fixture',
    purpose: 'baseline_validation',
    provider,
    sourceSha: null,
    workingTreeDirty: null,
    selectorSource: 'checked_in_synthetic_fixture',
    selectorVersion: null,
    selectorDigest: null,
    browserVersion: null,
    scenarios: [],
    expectedBaseline: baseline,
    probeErrors: [],
  };
  let browser;
  try {
    await rm(reportPath, { force: true });
    report.sourceSha = git('rev-parse', 'HEAD');
    report.workingTreeDirty = git('status', '--porcelain').length > 0;
    const selectorText = await readFile(here(selectorFile), 'utf8');
    const snapshot = JSON.parse(selectorText);
    report.selectorVersion = (snapshot.base ?? snapshot).version;
    report.selectorDigest = createHash('sha256').update(selectorText).digest('hex');
    const bundle = await buildProbe(entry, bundleName);
    browser = await chromium.launch();
    report.browserVersion = browser.version();
    await run({ browser, bundle, snapshot, report });
  } catch (error) {
    report.probeErrors.push(errorMessage(error));
  } finally {
    try {
      await browser?.close();
    } catch (error) {
      report.probeErrors.push(errorMessage(error));
    }
    report.summary = summarizeBaseline(report.scenarios, baseline, report.probeErrors);
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  console.log(`${provider} baseline validation: ${report.summary.baselineMatched ? 'PASS' : 'FAIL'}`);
  console.log(`Extraction healthy: ${report.summary.extractionHealthy}`);
  for (const result of report.scenarios) console.log(`${result.id}: ${result.status}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      [
        `## ${provider} fixture baseline (not live-site health)`,
        '',
        `Baseline matched: **${report.summary.baselineMatched}**. Extraction healthy: **${report.summary.extractionHealthy}**.`,
        '',
        '| Scenario | Observed outcome |',
        '| --- | --- |',
        ...report.scenarios.map(result => `| ${result.id} | ${result.status} |`),
        '',
        'Known extraction failures are expected only in this unchanged-baseline test. See the JSON report for assertions.',
        '',
      ].join('\n'),
    );
  }
  if (!report.summary.baselineMatched) {
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  }
}

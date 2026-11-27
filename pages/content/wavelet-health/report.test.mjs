import assert from 'node:assert/strict';
import { test } from 'vitest';
import { captureAssertions, equalAssertion, scenarioResult, summarizeBaseline } from './report.mjs';

test('distinguishes no capture, wrong values, and browser errors', () => {
  const missing = captureAssertions([], [{ id: 'first' }]);
  assert.equal(scenarioResult('missing', missing).status, 'extraction_failure');
  assert.equal(scenarioResult('initial', [equalAssertion('initial.capture_count', 1, 0)]).status, 'extraction_failure');
  const wrong = captureAssertions([{ id: 'previous' }], [{ id: 'current' }]);
  assert.equal(scenarioResult('wrong', wrong).status, 'value_mismatch');
  assert.equal(scenarioResult('crash', missing, ['Browser crashed']).status, 'probe_error');
});

test('accepts only the exact expected baseline, without claiming extraction is healthy', () => {
  const baseline = [{ id: 'counts', status: 'value_mismatch', failedAssertions: ['likes'] }];
  const result = scenarioResult('counts', [equalAssertion('likes', 1234, 0)]);
  assert.deepEqual(summarizeBaseline([result], baseline, []), {
    baselineMatched: true,
    extractionHealthy: false,
    counts: { passed: 0, extraction_failure: 0, value_mismatch: 1, probe_error: 0 },
  });
  assert.equal(summarizeBaseline([], baseline, []).baselineMatched, false);
  assert.equal(summarizeBaseline([result, result], baseline, []).baselineMatched, false);
  assert.equal(summarizeBaseline([result], baseline, ['Browser failed']).baselineMatched, false);
  const otherFailure = scenarioResult('counts', [equalAssertion('id', 'current', 'previous')]);
  assert.equal(summarizeBaseline([otherFailure], baseline, []).baselineMatched, false);
  const repaired = scenarioResult('counts', [equalAssertion('likes', 1234, 1234)]);
  assert.equal(summarizeBaseline([repaired], baseline, []).baselineMatched, false);
  const wrongScenario = { ...repaired, id: 'unknown' };
  assert.equal(summarizeBaseline([wrongScenario], baseline, []).extractionHealthy, false);
});

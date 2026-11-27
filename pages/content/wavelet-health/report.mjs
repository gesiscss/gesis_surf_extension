import { isDeepStrictEqual } from 'node:util';

export function equalAssertion(name, expected, observed) {
  return { name, expected, observed: observed ?? null, passed: isDeepStrictEqual(expected, observed) };
}

export function captureAssertions(captures, expected) {
  const assertions = [equalAssertion('capture_count', expected.length, captures.length)];
  if (!assertions[0].passed) return assertions;

  expected.forEach((post, index) => {
    for (const [field, value] of Object.entries(post)) {
      assertions.push(
        equalAssertion(expected.length === 1 ? field : `capture_${index + 1}.${field}`, value, captures[index][field]),
      );
    }
  });
  return assertions;
}

export function scenarioResult(id, assertions, probeErrors = []) {
  let status = 'passed';
  if (probeErrors.length) status = 'probe_error';
  else if (assertions.some(assertion => !assertion.passed && /(^|\.)capture_count$/.test(assertion.name))) {
    status = 'extraction_failure';
  } else if (assertions.some(assertion => !assertion.passed)) status = 'value_mismatch';

  return { id, status, assertions, probeErrors };
}

export function summarizeBaseline(scenarios, baseline, probeErrors) {
  const complete =
    scenarios.length === baseline.length &&
    baseline.every(expected => scenarios.filter(result => result.id === expected.id).length === 1);
  const baselineMatched =
    probeErrors.length === 0 &&
    complete &&
    baseline.every(expected => {
      const matches = scenarios.filter(result => result.id === expected.id);
      if (matches.length !== 1) return false;
      const [result] = matches;
      const failedAssertions = result.assertions
        .filter(assertion => !assertion.passed)
        .map(assertion => assertion.name);
      return result.status === expected.status && isDeepStrictEqual(failedAssertions, expected.failedAssertions);
    });

  return {
    baselineMatched,
    extractionHealthy: complete && scenarios.every(result => result.status === 'passed') && probeErrors.length === 0,
    counts: Object.fromEntries(
      ['passed', 'extraction_failure', 'value_mismatch', 'probe_error'].map(status => [
        status,
        scenarios.filter(result => result.status === status).length,
      ]),
    ),
  };
}

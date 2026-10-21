// Acceptance must prove execution, even if a test runner exits zero with skipped suites.
export function verifyLiveReport(report) {
  const required = new Map([
    ['test/integration/ldap-directory.test.ts', 10],
    ['test/integration/ldap-rollout.test.ts', 4],
    ['test/security/ldap-transports.test.ts', 45],
    ['test/database/ldap-upgrade-recovery.test.ts', 2],
  ]);
  for (const [suffix, minimum] of required) {
    const suites = report.testResults?.filter(suite => suite.name.endsWith('/' + suffix)) ?? [];
    const cases = suites.flatMap(suite => suite.assertionResults ?? []);
    if (cases.length < minimum || cases.some(test => test.status !== 'passed')) {
      throw new Error('Live LDAP acceptance missing, failed or skipped: ' + suffix);
    }
  }
}

export function verifyBrowserReport(report) {
  const cases = [];
  function visit(suites) {
    for (const suite of suites ?? []) {
      for (const spec of suite.specs ?? []) cases.push(...spec.tests);
      visit(suite.suites);
    }
  }
  visit(report.suites);
  if (cases.length < 3 || cases.some(test => test.expectedStatus !== 'passed' ||
      test.status !== 'expected' || test.results.at(-1)?.status !== 'passed')) {
    throw new Error('Dedicated LDAP browser acceptance missing, failed or skipped');
  }
}

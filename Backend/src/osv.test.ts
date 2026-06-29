import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  compareVersions,
  isStableVersion,
  highestVersion,
  ecosystemFixedVersion,
  osvSeverity,
  maxSeverity,
  normalizeOsv,
  type OsvReport,
  type OsvVuln,
} from './osv.js'

test('compareVersions is numeric, not lexical', () => {
  assert.ok(compareVersions('1.10.0', '1.9.0') > 0) // 10 > 9 (string compare would fail)
  assert.ok(compareVersions('1.2.0', '1.10.0') < 0)
  assert.equal(compareVersions('2.0.0', '2.0.0'), 0)
  assert.ok(compareVersions('1.54.0', '8.0.0') < 0)
})

test('isStableVersion rejects prereleases and git hashes', () => {
  assert.equal(isStableVersion('1.54.0'), true)
  assert.equal(isStableVersion('v2.3.4'), true)
  assert.equal(isStableVersion('8.0.0-rc.6'), false)
  assert.equal(isStableVersion('1.0a1'), false)
  assert.equal(isStableVersion('80d9979d5f4a00217743d607078a1d867fad8acf'), false) // git hash
})

test('highestVersion picks the maximum (minimum sufficient bump)', () => {
  assert.equal(highestVersion(['1.30.0', '1.54.0', '1.37.0']), '1.54.0')
  assert.equal(highestVersion([]), undefined)
})

test('ecosystemFixedVersion skips GIT ranges, returns the real version', () => {
  const vuln: OsvVuln = {
    id: 'X',
    affected: [
      { ranges: [{ type: 'GIT', events: [{ fixed: 'deadbeef' }] }] },
      { ranges: [{ type: 'ECOSYSTEM', events: [{ introduced: '0' }, { fixed: '4.17.21' }] }] },
    ],
  }
  assert.equal(ecosystemFixedVersion(vuln), '4.17.21')
})

test('osvSeverity maps labels then CVSS', () => {
  assert.equal(osvSeverity({ id: 'a', database_specific: { severity: 'HIGH' } }), 'High')
  assert.equal(osvSeverity({ id: 'a', database_specific: { severity: 'MODERATE' } }), 'Medium')
  assert.equal(osvSeverity({ id: 'a' }, [{ ids: ['a'], max_severity: '9.8' }]), 'Critical')
  assert.equal(osvSeverity({ id: 'a' }, [{ ids: ['a'], max_severity: '5.3' }]), 'Medium')
})

test('maxSeverity returns the worst', () => {
  assert.equal(maxSeverity(['Low', 'High', 'Medium']), 'High')
  assert.equal(maxSeverity(['Low']), 'Low')
})

test('normalizeOsv groups per package, picks stable fix, drops prerelease-only', () => {
  const report: OsvReport = {
    results: [
      {
        source: { path: '/work/repo/package-lock.json' },
        packages: [
          {
            package: { name: 'axios', version: '1.11.0', ecosystem: 'npm' },
            groups: [{ ids: ['GHSA-a'], max_severity: '7.5' }],
            vulnerabilities: [
              { id: 'GHSA-a', aliases: ['CVE-1'], database_specific: { severity: 'HIGH' }, affected: [{ ranges: [{ type: 'ECOSYSTEM', events: [{ fixed: '1.16.0' }] }] }] },
              { id: 'GHSA-b', aliases: ['CVE-2'], database_specific: { severity: 'MODERATE' }, affected: [{ ranges: [{ type: 'ECOSYSTEM', events: [{ fixed: '1.13.0' }] }] }] },
            ],
          },
          {
            package: { name: 'babel', version: '7.0.0', ecosystem: 'npm' },
            vulnerabilities: [
              { id: 'GHSA-c', aliases: ['CVE-3'], database_specific: { severity: 'LOW' }, affected: [{ ranges: [{ type: 'ECOSYSTEM', events: [{ fixed: '8.0.0-rc.6' }] }] }] },
            ],
          },
        ],
      },
    ],
  }
  const findings = normalizeOsv(report, '/work/repo')
  assert.equal(findings.length, 2)

  const axios = findings.find((f) => f.label.startsWith('axios'))!
  assert.equal(axios.severity, 'High') // worst of its two advisories
  assert.equal(axios.id, 'npm:axios@1.11.0')
  assert.equal(axios.fix?.fixedVersion, '1.16.0') // highest stable across both CVEs
  assert.equal(axios.fix?.manifest, 'package-lock.json')

  const babel = findings.find((f) => f.label.startsWith('babel'))!
  assert.equal(babel.fix, undefined) // only an RC fix exists → no auto-fix
})

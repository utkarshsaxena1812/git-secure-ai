import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyPipBump,
  editNpmPackageJson,
  isAutoFixable,
  ecosystemOf,
  planDependencyFix,
} from './fix.js'
import type { DependencyFix, Finding } from './types.js'

const depFinding = (fix?: Partial<DependencyFix>): Finding => ({
  id: 'npm:axios@1.11.0',
  label: 'axios 1.11.0',
  severity: 'High',
  category: 'Dependency',
  ref: 'axios@1.11.0',
  beginner: { what: 'w', why: 'y', fix: 'f' },
  pro: { what: 'w', why: 'y', fix: 'f' },
  fix: fix
    ? { ecosystem: 'npm', package: 'axios', currentVersion: '1.11.0', fixedVersion: '1.16.0', manifest: 'package-lock.json', advisory: 'CVE-1', ...fix }
    : undefined,
})

// ---- pip ----

test('applyPipBump pins an unpinned requirement', () => {
  assert.equal(applyPipBump('streamlit\nflask==2.0.0\n', 'streamlit', '1.54.0'), 'streamlit==1.54.0\nflask==2.0.0\n')
})

test('applyPipBump replaces an existing pin', () => {
  assert.equal(applyPipBump('streamlit==1.9.2', 'streamlit', '1.54.0'), 'streamlit==1.54.0')
})

test('applyPipBump preserves extras and markers, matches normalized names', () => {
  assert.equal(applyPipBump('Stream_Lit[extra]>=1.0 ; python_version>"3.8"', 'stream-lit', '1.54.0'), 'Stream_Lit[extra]==1.54.0 ; python_version>"3.8"')
})

test('applyPipBump returns null when the package is absent (transitive)', () => {
  assert.equal(applyPipBump('flask==2.0.0\n', 'streamlit', '1.54.0'), null)
})

// ---- npm ----

test('editNpmPackageJson bumps a direct dep in place, preserving the operator', () => {
  const out = editNpmPackageJson(JSON.stringify({ dependencies: { axios: '^1.11.0' } }, null, 2), 'axios', '1.16.0')!
  assert.equal(out.strategy, 'range')
  assert.equal(JSON.parse(out.content).dependencies.axios, '^1.16.0')
})

test('editNpmPackageJson keeps an exact pin exact', () => {
  const out = editNpmPackageJson(JSON.stringify({ dependencies: { axios: '1.11.0' } }), 'axios', '1.16.0')!
  assert.equal(JSON.parse(out.content).dependencies.axios, '1.16.0')
})

test('editNpmPackageJson uses overrides for a transitive dep', () => {
  const out = editNpmPackageJson(JSON.stringify({ dependencies: { express: '^4.0.0' } }), 'brace-expansion', '5.0.5')!
  assert.equal(out.strategy, 'override')
  assert.equal(JSON.parse(out.content).overrides['brace-expansion'], '5.0.5')
})

test('editNpmPackageJson returns null for unparseable package.json', () => {
  assert.equal(editNpmPackageJson('{ not json', 'axios', '1.16.0'), null)
})

// ---- planning / gating ----

test('isAutoFixable: only dependency findings with a fix in a supported ecosystem', () => {
  assert.equal(isAutoFixable(depFinding({})), true)
  assert.equal(isAutoFixable(depFinding()), false) // no fix data
  assert.equal(isAutoFixable(depFinding({ ecosystem: 'Go' })), false) // unsupported ecosystem
  const secret: Finding = { ...depFinding({}), category: 'Secret' }
  assert.equal(isAutoFixable(secret), false)
})

test('ecosystemOf maps PyPI/pip and npm', () => {
  assert.equal(ecosystemOf({ ecosystem: 'PyPI' } as DependencyFix), 'pip')
  assert.equal(ecosystemOf({ ecosystem: 'npm' } as DependencyFix), 'npm')
  assert.equal(ecosystemOf({ ecosystem: 'Go' } as DependencyFix), 'other')
})

test('planDependencyFix builds a bump plan for a dependency, null for a secret', () => {
  const plan = planDependencyFix(depFinding({}))!
  assert.equal(plan.fromVersion, '1.11.0')
  assert.equal(plan.toVersion, '1.16.0')
  assert.match(plan.branch, /^secure-ai\/bump-axios-1\.16\.0$/)
  assert.match(plan.title, /axios/)
  const secret: Finding = { ...depFinding({}), category: 'Secret' }
  assert.equal(planDependencyFix(secret), null)
})

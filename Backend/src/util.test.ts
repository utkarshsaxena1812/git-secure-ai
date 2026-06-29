import { test } from 'node:test'
import assert from 'node:assert/strict'
import { relativeTime } from './util.js'

const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

test('relativeTime renders human buckets', () => {
  assert.equal(relativeTime(ago(5 * 1000)), 'just now')
  assert.equal(relativeTime(ago(1 * 60 * 1000)), '1 minute ago')
  assert.equal(relativeTime(ago(5 * 60 * 1000)), '5 minutes ago')
  assert.equal(relativeTime(ago(1 * 60 * 60 * 1000)), '1 hour ago')
  assert.equal(relativeTime(ago(3 * 60 * 60 * 1000)), '3 hours ago')
  assert.equal(relativeTime(ago(2 * 24 * 60 * 60 * 1000)), '2 days ago')
})

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDateUpdate } from '../src/services/closingDateRefresh.service.js';
import { parseISTDate } from '../src/utils/dateUtils.js';

const now = new Date('2026-11-10T09:00:00Z');
const stored = (over = {}) => ({
  status: 'ACTIVE',
  isDelisted: false,
  closingDate: parseISTDate('10-Nov-2026 10:00 AM'),
  bidSubmissionEndDate: parseISTDate('10-Nov-2026 10:00 AM'),
  bidOpeningDate: parseISTDate('11-Nov-2026 11:00 AM'),
  ...over,
});

test('extended closing date updates closing and bid-submission fields', () => {
  const set = buildDateUpdate(stored(), { closing: '12-Nov-2026 10:00 AM', opening: '13-Nov-2026 11:00 AM' }, now);
  assert.equal(set.closingDate.toISOString(), parseISTDate('12-Nov-2026 10:00 AM').toISOString());
  assert.equal(set.bidSubmissionEndDate.toISOString(), set.closingDate.toISOString());
  assert.equal(set.closingDateStr, '12-Nov-2026 10:00 AM');
  assert.equal(set.bidOpeningDate.toISOString(), parseISTDate('13-Nov-2026 11:00 AM').toISOString());
  assert.equal(set.status, undefined);
});

test('unchanged dates produce no update', () => {
  assert.equal(buildDateUpdate(stored(), { closing: '10-Nov-2026 10:00 AM', opening: '11-Nov-2026 11:00 AM' }, now), null);
});

test('expired tender with an extended date is reactivated', () => {
  const set = buildDateUpdate(stored({ status: 'EXPIRED' }), { closing: '12-Nov-2026 10:00 AM', opening: '' }, now);
  assert.equal(set.status, 'ACTIVE');
});

test('cancelled or delisted tenders are re-dated but not reactivated', () => {
  assert.equal(buildDateUpdate(stored({ status: 'CANCELLED' }), { closing: '12-Nov-2026 10:00 AM', opening: '' }, now).status, undefined);
  assert.equal(buildDateUpdate(stored({ status: 'EXPIRED', isDelisted: true }), { closing: '12-Nov-2026 10:00 AM', opening: '' }, now).status, undefined);
});

test('unparseable portal date is ignored', () => {
  assert.equal(buildDateUpdate(stored(), { closing: 'NA', opening: '' }, now), null);
});

test('bid deadline unchanged leaves a stretched closingDate alone', () => {
  const set = buildDateUpdate(stored({ closingDate: parseISTDate('10-Nov-2026 05:00 PM') }), { closing: '10-Nov-2026 10:00 AM', opening: '11-Nov-2026 11:00 AM' }, now);
  assert.equal(set, null);
});

test('extension still respects a later document-download end', () => {
  const docEnd = parseISTDate('12-Nov-2026 05:00 PM');
  const set = buildDateUpdate(stored({ documentDownloadEndDate: docEnd, documentDownloadEndDateStr: '12-Nov-2026 05:00 PM' }), { closing: '12-Nov-2026 10:00 AM', opening: '' }, now);
  assert.equal(set.closingDate.toISOString(), docEnd.toISOString());
  assert.equal(set.bidSubmissionEndDate.toISOString(), parseISTDate('12-Nov-2026 10:00 AM').toISOString());
});

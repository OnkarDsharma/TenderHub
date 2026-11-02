import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canonicalizeGeMState, parseGeMBidPdfText, GEM_PARSER_VERSION } from '../src/utils/gemPdfParser.js';

const fixture = (name) => readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('canonicalizes known state aliases and rejects unknown ministry labels', () => {
  assert.equal(canonicalizeGeMState('J&K'), 'Jammu & Kashmir');
  assert.equal(canonicalizeGeMState('Jammu and Kashmir'), 'Jammu & Kashmir');
  assert.equal(canonicalizeGeMState('NCT of Delhi'), 'Delhi');
  assert.equal(canonicalizeGeMState('Ministry of Defence'), null);
  assert.equal(canonicalizeGeMState('Punjab Food Corporation'), null);
});

test('parses Punjab RA state and delivery evidence from the delivery section', async () => {
  const parsed = parseGeMBidPdfText(await fixture('gem-ra-punjab-synthetic.txt'));
  assert.equal(parsed.bidNumber, 'GEM/2026/R/762098');
  assert.equal(parsed.documentType, 'RA');
  assert.equal(parsed.state, 'Punjab');
  assert.equal(parsed.fieldConfidence.officialState, 'verified');
  assert.match(parsed.rawDeliverySection, /Mohali, Punjab/);
  assert.ok(parsed.deliveryLocations.includes('Mohali'));
  assert.equal(parsed.parserVersion, GEM_PARSER_VERSION);
});

test('does not infer Gujarat delivery location from Punjabi product wording', async () => {
  const parsed = parseGeMBidPdfText(await fixture('gem-ra-gujarat-synthetic.txt'));
  assert.equal(parsed.bidNumber, 'GEM/2026/R/762034');
  assert.equal(parsed.state, 'Gujarat');
  assert.equal(parsed.location, null);
  assert.equal(parsed.fieldConfidence.deliveryLocation, 'unknown');
  assert.ok(parsed.validationFlags.includes('DELIVERY_SECTION_NOT_FOUND'));
});

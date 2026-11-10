import test from 'node:test';
import assert from 'node:assert/strict';
import Tender from '../src/models/Tender.js';
import { ContractorAgentService } from '../src/services/contractorAgent.service.js';

test('an unknown tender ID is a 404, never an invented stand-in tender', async (t) => {
  const none = { select: async () => null };
  t.mock.method(Tender, 'findById', () => none);
  t.mock.method(Tender, 'findOne', () => none);
  const svc = new ContractorAgentService();
  t.mock.method(svc, 'getOrCreateContractorProfile', async () => ({
    companyName: 'Real Firm', registrationClass: 'Class B Works', avgAnnualTurnoverInr: 1e7,
    solvencyLimitInr: 0, largestSingleWorkDoneInr: 4e6, profileConfiguredAt: new Date(),
  }));
  const ai = t.mock.method(svc, 'executeGeminiTenderAnalysis', async () => { throw new Error('AI must not run'); });

  for (const id of ['2026_PWD_999999_1', '2026_JAL_1', 'GEM/2026/B/0000001', '64b7f0c2a9b3e41d2c7f0099']) {
    await assert.rejects(svc.getOrGenerateTenderDossier(id, 'user-1', true), (err) => {
      assert.equal(err.status, 404);
      assert.equal(err.error, 'TENDER_NOT_FOUND');
      return true;
    });
  }
  assert.equal(ai.mock.callCount(), 0);
});

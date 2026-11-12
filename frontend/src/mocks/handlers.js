/**
 * @file frontend/src/mocks/handlers.js
 * @description Route table for the dev mock API. Each entry is
 * [method, pathPattern, handler({ params, query, body, headers, respond })].
 * Static paths must come before `:param` paths with the same prefix.
 */
import { httpError, MOCK_OTP } from './mockApi';
import {
  STATE_TENDERS, GEM_BIDS, ALL_TENDERS, findTender, toSummary, filterTenders, paginate, tenderCounts,
  tenderStats, organisations, gemStats, relatedTendersFor, statusBucket,
} from './fixtures/tenders';
import { slugify } from '@/utils/tenderUrl';
import { LANDING_STATES } from '@/utils/landingStates';
import {
  TEST_ACCOUNT, buildUser, fakeJwt, getState, saveState, AI_PLANS, buildDossier, copilotReply, evaluateBid,
} from './fixtures/account';

const DAY = 24 * 60 * 60 * 1000;
const iso = (offsetDays = 0) => new Date(Date.now() + offsetDays * DAY).toISOString();
const oid = (suffix) => `6abe2b7f4ec335668fdc${String(suffix).padStart(4, '0')}`;

const bearer = (headers) => {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get('Authorization') || headers.get('authorization') || '';
  return headers.Authorization || headers.authorization || '';
};
// Mirrors backend TenderAlert rows for saved tenders that moved on the portal.
const mockTenderAlerts = () => {
  const { savedTenderIds = [], readAlertIds = [] } = getState();
  return savedTenderIds
    .map((id) => STATE_TENDERS.find((t) => t._id === id))
    .filter((t) => t?.tenderStatusInfo?.currentStage)
    .map((t, i) => {
      const info = t.tenderStatusInfo;
      const cancelled = /cancel|retender/i.test(info.currentStage);
      const _id = `alert_${t._id}`;
      return {
        _id,
        tenderId: t._id,
        sourceTenderId: t.sourceTenderId,
        title: t.title.replace(/[[\]]/g, ''),
        kind: info.isAocDone ? 'AWARDED' : cancelled ? 'CANCELLED' : 'STAGE',
        previousStage: 'To_be_Opened',
        currentStage: info.currentStage,
        completedStages: info.stages.filter((st) => st.completed).slice(-1).map((st) => st.name),
        isRead: readAlertIds.includes(_id),
        createdAt: new Date(Date.now() - (i * 26 + 5) * 60 * 60 * 1000).toISOString(),
      };
    });
};
const isAuthed = (headers) => Boolean(getState().session) && Boolean(bearer(headers));
const requireAuth = (headers) => {
  if (!isAuthed(headers)) throw httpError(401, { error: 'Please sign in to continue.' });
  return getState().session;
};
const currentUser = () => {
  const s = getState().session;
  return s ? buildUser(s.email, s.name) : null;
};

const dossierCache = new Map();
function dossierFor(tender) {
  if (!dossierCache.has(tender._id)) {
    dossierCache.set(tender._id, buildDossier(tender, getState().agentProfile));
  }
  return dossierCache.get(tender._id);
}
function resolveTender(id) {
  return findTender(id) || (id && /^[a-f\d]{24}$/i.test(id) ? ALL_TENDERS.find((t) => t._id === id) : null);
}
const savedTenders = () => getState().savedTenderIds.map((id) => ALL_TENDERS.find((t) => t._id === id || t.sourceTenderId === id)).filter(Boolean);

export function buildHandlers() {
  return [
    /* ---------------------------- auth ---------------------------- */
    ['get', '/auth/me', ({ headers }) => {
      if (!isAuthed(headers)) throw httpError(401, { error: 'User session invalid or deactivated.' });
      return { success: true, user: currentUser() };
    }],
    ['post', '/auth/send-otp', ({ body }) => {
      const email = String(body.email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw httpError(400, { error: 'Please provide a valid email address.' });
      return { success: true, message: `Mock mode: use code ${MOCK_OTP}.`, cooldownSeconds: 5 };
    }],
    ['post', '/auth/verify-otp', ({ body }) => {
      const email = String(body.email || '').trim().toLowerCase();
      if (String(body.otp || '').trim() !== MOCK_OTP) throw httpError(400, { error: `Incorrect verification code. In mock mode the code is ${MOCK_OTP}.` });
      const name = body.profileDetails?.name?.trim() || (email === TEST_ACCOUNT.email ? TEST_ACCOUNT.name : email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
      saveState((s) => {
        s.session = { email, name };
        if (body.type === 'signup' && body.profileDetails) {
          const p = body.profileDetails;
          if (p.affiliation) s.contractorProfile.affiliation = p.affiliation;
          if (p.contractorId) s.contractorProfile.contractorId = p.contractorId;
          if (p.registrationClass) { s.contractorProfile.registrationClass = p.registrationClass; s.agentProfile.registrationClass = p.registrationClass; }
          if (p.jurisdiction) s.contractorProfile.jurisdiction = p.jurisdiction;
          if (p.preferences) s.contractorProfile.preferences = { ...s.contractorProfile.preferences, ...p.preferences, isConfigured: true };
        }
      });
      return { success: true, message: 'Signed in successfully', accessToken: fakeJwt(email), user: currentUser() };
    }],
    ['post', '/auth/refresh', ({ headers }) => {
      const s = getState().session;
      if (!s || !bearer(headers)) throw httpError(401, { error: 'Refresh token not found' });
      return { accessToken: fakeJwt(s.email) };
    }],
    ['post', '/auth/logout', () => {
      saveState((s) => { s.session = null; });
      return { success: true, message: 'Logged out successfully' };
    }],

    /* -------------------------- tenders --------------------------- */
    ['get', '/tenders/stats', ({ query }) => tenderStats(query)],
    ['get', '/tenders/organizations', ({ query }) => ({ data: organisations(query) })],
    ['get', '/tenders', ({ query }) => {
      const portal = (query.portal || '').toUpperCase();
      const source = portal === 'GEM' ? GEM_BIDS : portal === 'ALL' ? ALL_TENDERS : STATE_TENDERS;
      const rows = filterTenders(source, query);
      const { page, limit, slice, total } = paginate(rows, query, 12);
      return { data: slice.map(toSummary), meta: { total, page, limit, ...tenderCounts(source) } };
    }],
    ['get', '/tenders/:id/zip', () => { throw httpError(404, { message: 'No ZIP archive found for this tender (mock mode serves no files).' }); }],
    ['get', '/tenders/:id', ({ params, headers }) => {
      const t = resolveTender(params.id);
      if (!t) throw httpError(404, { error: 'Tender not found' });
      const user = isAuthed(headers) ? currentUser() : null;
      return {
        ...t,
        relatedTenders: relatedTendersFor(t),
        viewsInfo: user
          ? { viewsUsed: 0, viewsLimit: 'Unlimited', viewsRemaining: 'Unlimited', resetsAt: null, date: iso(0).slice(0, 10) }
          : { viewsUsed: 1, viewsLimit: 3, viewsRemaining: 2, resetsAt: iso(1), date: iso(0).slice(0, 10) },
      };
    }],

    /* ---------------------------- SEO ----------------------------- */
    // Mirrors backend/src/routes/seo.routes.js (landing pages, similar tenders).
    ['get', '/seo/similar/:id', ({ params }) => {
      const t = findTender(params.id);
      if (!t) throw httpError(404, { error: 'Tender not found' });
      const pool = (GEM_BIDS.includes(t) ? GEM_BIDS : STATE_TENDERS).filter((x) => x !== t && statusBucket(x) === 'active');
      const same = pool.filter((x) => x.departmentName === t.departmentName || x.state === t.state);
      return { data: same.slice(0, 6).map(toSummary) };
    }],
    ['get', '/seo/landing/:kind', ({ params }) => mockLanding(params.kind)],
    ['get', '/seo/landing/:kind/:state', ({ params }) => mockLanding(params.kind, params.state)],
    ['get', '/seo/landing/:kind/:state/:dept', ({ params }) => mockLanding(params.kind, params.state, params.dept)],

    /* ---------------------------- GeM ----------------------------- */
    ['get', '/gem/stats', ({ query }) => ({ success: true, stats: gemStats(query) })],
    ['get', '/gem/tenders', ({ query }) => {
      const rows = filterTenders(GEM_BIDS, query);
      const { page, limit, slice, total } = paginate(rows, query, 12);
      const totalPages = Math.max(1, Math.ceil(total / limit));
      return { success: true, data: slice, pagination: { currentPage: page, totalPages, totalCount: total, limit, hasMore: page < totalPages } };
    }],
    ['get', '/gem/tenders/:id', ({ params }) => {
      const t = GEM_BIDS.find((b) => [b._id, b.sourceTenderId, b.tenderReferenceNumber].some((v) => v.toLowerCase() === decodeURIComponent(params.id).toLowerCase()));
      if (!t) throw httpError(404, { success: false, error: 'GeM bid not found' });
      return { success: true, data: t };
    }],
    ['post', '/gem/sync', ({ body }) => ({ success: true, message: `GeM crawl started in background for ${body.state || 'JAMMU & KASHMIR'} with rate limiting gap.` })],

    /* -------------------------- waitlist -------------------------- */
    ['post', '/waitlist', ({ body }) => {
      if (!/^\+91[6-9]\d{9}$/.test(String(body.phone || '').replace(/\s/g, ''))) throw httpError(400, { success: false, message: 'Enter a valid Indian mobile number with country code.' });
      const s = saveState((st) => { st.waitlistCount += 1; });
      return { success: true, message: 'Successfully joined waitlist', waitlistCount: s.waitlistCount };
    }],

    /* -------------------------- services -------------------------- */
    ['get', '/services/plans', () => ({ success: true, plans: AI_PLANS })],
    ['get', '/services/contractor-profile', ({ headers }) => { requireAuth(headers); return { success: true, profile: getState().agentProfile }; }],
    ['put', '/services/contractor-profile', ({ headers, body }) => {
      requireAuth(headers);
      const allowed = ['companyName', 'registrationClass', 'primaryJurisdiction', 'avgAnnualTurnoverInr', 'solvencyLimitInr', 'ongoingCommitmentsInr', 'largestSingleWorkDoneInr', 'machineryInventory', 'specialties', 'licences', 'customInstructions'];
      const s = saveState((st) => {
        for (const k of allowed) if (k in body) st.agentProfile[k] = body[k];
        const p = st.agentProfile;
        const complete = ['companyName', 'registrationClass'].every((k) => String(p[k] || '').trim())
          && ['avgAnnualTurnoverInr', 'solvencyLimitInr', 'largestSingleWorkDoneInr'].every((k) => p[k] !== '' && p[k] !== null && Number.isFinite(Number(p[k])) && Number(p[k]) >= 0);
        p.profileConfiguredAt = complete ? (p.profileConfiguredAt || iso(0)) : null;
        st.agentProfile.updatedAt = iso(0);
      });
      dossierCache.clear();
      return { success: true, profile: s.agentProfile, message: 'Contractor profile updated' };
    }],
    ['post', '/services/analyze', ({ headers, body }) => {
      requireAuth(headers);
      if (!getState().agentProfile.profileConfiguredAt) throw httpError(409, { success: false, error: 'PROFILE_REQUIRED', message: 'Set up your contractor profile (firm name, registration class, turnover, solvency and largest similar work) before running an AI analysis.' });
      const t = resolveTender(body.tenderId);
      if (!t) throw httpError(404, { success: false, error: 'TENDER_NOT_FOUND', message: 'This tender is not in TenderHub. Check the ID, or pick the tender from Browse Tenders or GeM Bids.' });
      const { dossier, personalizedFit } = dossierFor(t);
      saveState((st) => {
        const c = st.agentProfile.credits;
        c.dailyDossiersUsed = (c.dailyDossiersUsed || 0) + 1;
        c.usedDossiers = (c.usedDossiers || 0) + 1;
        c.lastDossierDate = iso(0);
        if (!st.agentProfile.analyzedTenders.includes(t._id)) st.agentProfile.analyzedTenders.push(t._id);
      });
      return { success: true, dossier, personalizedFit, message: 'AI Tender Dossier generated successfully' };
    }],
    ['get', '/services/dossier', ({ headers, query }) => {
      requireAuth(headers);
      const t = resolveTender(query.tenderId);
      if (!t || !getState().agentProfile.analyzedTenders.includes(t._id)) throw httpError(404, { success: false, error: 'No AI Dossier exists yet for this tender. Click "Analyze" to generate.' });
      return { success: true, ...dossierFor(t) };
    }],
    ['post', '/services/chat', ({ headers, body }) => {
      requireAuth(headers);
      const t = resolveTender(body.tenderId);
      if (!t) throw httpError(404, { success: false, error: 'Tender not found' });
      const { dossier, personalizedFit } = dossierFor(t);
      const s = saveState((st) => { st.agentProfile.credits.copilotQueriesUsed = (st.agentProfile.credits.copilotQueriesUsed || 0) + 1; });
      const c = s.agentProfile.credits;
      return { success: true, reply: copilotReply(body.message, dossier, personalizedFit), remainingQueries: Math.max(0, c.copilotQueriesLimit - c.copilotQueriesUsed), chatLockedUntil: null };
    }],
    ['get', '/services/my-dossiers', ({ headers }) => {
      requireAuth(headers);
      const list = getState().agentProfile.analyzedTenders.map((id) => ALL_TENDERS.find((t) => t._id === id)).filter(Boolean).map((t) => {
        const { dossier } = dossierFor(t);
        return { ...dossier, tenderId: { _id: t._id, title: t.title, departmentName: t.departmentName, estimatedValue: t.estimatedValue, location: t.location, closingDate: t.closingDate } };
      });
      return { success: true, dossiers: list, count: list.length };
    }],

    /* ------------------------- contractor ------------------------- */
    ['get', '/contractor/profile', ({ headers }) => { requireAuth(headers); return { success: true, data: { ...getState().contractorProfile, savedTenders: getState().savedTenderIds } }; }],
    ['put', '/contractor/profile', ({ headers, body }) => {
      requireAuth(headers);
      const s = saveState((st) => {
        for (const k of ['name', 'jurisdiction', 'affiliation', 'divisionBadge', 'registrationClass', 'contractorId']) if (k in body) st.contractorProfile[k] = body[k];
        if (body.preferences) st.contractorProfile.preferences = { ...st.contractorProfile.preferences, ...body.preferences };
        if (body.financialMetrics) st.contractorProfile.financialMetrics = { ...st.contractorProfile.financialMetrics, ...body.financialMetrics };
      });
      return { success: true, data: s.contractorProfile, message: 'Profile updated' };
    }],
    ['get', '/contractor/preferences', ({ headers }) => { requireAuth(headers); return { success: true, data: getState().contractorProfile.preferences }; }],
    ['put', '/contractor/preferences', ({ headers, body }) => {
      requireAuth(headers);
      const s = saveState((st) => { st.contractorProfile.preferences = { ...st.contractorProfile.preferences, ...body, isConfigured: true }; });
      return { success: true, data: s.contractorProfile.preferences };
    }],
    ['get', '/contractor/saved-tenders', ({ headers }) => {
      if (!isAuthed(headers)) return { success: true, count: 0, data: [] };
      const rows = savedTenders();
      return { success: true, count: rows.length, data: rows };
    }],
    ['post', '/contractor/saved-tenders/toggle', ({ headers, body }) => {
      if (!isAuthed(headers)) throw httpError(401, { error: 'Please sign in to save tenders to your contractor profile.' });
      const t = resolveTender(body.tenderId);
      if (!t) throw httpError(404, { error: 'Tender not found' });
      let isBookmarked = false;
      saveState((st) => {
        const i = st.savedTenderIds.indexOf(t._id);
        if (i >= 0) st.savedTenderIds.splice(i, 1);
        else { st.savedTenderIds.unshift(t._id); isBookmarked = true; }
      });
      const rows = savedTenders();
      return { success: true, isBookmarked, count: rows.length, data: rows, message: isBookmarked ? 'Tender bookmarked successfully' : 'Tender removed from saved list' };
    }],
    ['post', '/contractor/saved-tenders/sync', ({ headers, body }) => {
      requireAuth(headers);
      saveState((st) => {
        for (const id of body.tenderIds || []) {
          const t = resolveTender(id);
          if (t && !st.savedTenderIds.includes(t._id)) st.savedTenderIds.push(t._id);
        }
      });
      const rows = savedTenders();
      return { success: true, count: rows.length, data: rows };
    }],

    // Saved-tender updates: in mock mode every saved tender with portal status data has one alert.
    ['get', '/contractor/alerts', ({ headers }) => {
      if (!isAuthed(headers)) return { success: true, unreadCount: 0, data: [] };
      const data = mockTenderAlerts();
      return { success: true, unreadCount: data.filter((a) => !a.isRead).length, data };
    }],
    ['post', '/contractor/alerts/read', ({ headers, body }) => {
      requireAuth(headers);
      const ids = Array.isArray(body?.ids) ? body.ids : mockTenderAlerts().map((a) => a._id);
      saveState((st) => { st.readAlertIds = [...new Set([...(st.readAlertIds || []), ...ids])]; });
      const data = mockTenderAlerts();
      return { success: true, updated: ids.length, unreadCount: data.filter((a) => !a.isRead).length };
    }],

    /* --------------------------- billing -------------------------- */
    ['get', '/billing/plans', () => ({
      success: true,
      plans: [
        { id: 'pro_monthly', name: 'Contractor Pro (Monthly)', price: 999, periodDays: 30, cycle: 'monthly', popular: true, description: 'Full tender access and alerts.', features: ['Unlimited tender views', 'WhatsApp alerts', 'Saved tenders sync'] },
        { id: 'pro_quarterly', name: 'Contractor Pro (Quarterly)', price: 2499, periodDays: 90, cycle: 'quarterly', popular: false, description: 'Three months of Pro.', features: ['Everything in monthly', '15% saving'] },
        { id: 'pro_annual', name: 'Contractor Pro (Annual)', price: 7999, periodDays: 365, cycle: 'annual', popular: false, description: 'A full year of Pro.', features: ['Everything in monthly', '33% saving'] },
        ...AI_PLANS.map((p) => ({ id: `ai_${p.id}`, name: p.name, price: p.price, periodDays: p.periodDays, cycle: 'one-time', popular: p.popular, description: p.description, features: p.features, dossierCredits: p.dossierCredits, chatQueries: p.chatQueries })),
      ],
    })],
    ['get', '/billing/status', ({ headers }) => (isAuthed(headers)
      ? { success: true, subscription: { hasActiveSubscription: true, status: 'active', planId: 'contractor_pro', billingCycle: 'monthly', currentPeriodEnd: iso(30), features: {} } }
      : { success: true, subscription: { hasActiveSubscription: false, status: 'free', plan: null } })],
    ['post', '/billing/create-order', ({ headers, body }) => {
      requireAuth(headers);
      const user = currentUser();
      return { success: true, orderId: `order_mock_${Date.now().toString(36)}`, amount: 99900, currency: 'INR', keyId: 'rzp_test_mock', isMock: true, plan: { id: body.planId, name: body.planId, price: 999 }, prefill: { name: user.name, email: user.email } };
    }],
    ['post', '/billing/verify-payment', ({ headers, body }) => {
      requireAuth(headers);
      return { success: true, message: 'Subscription successfully activated! All Pro features unlocked.', subscription: { userId: currentUser().id, planId: body.planId, status: 'active', billingCycle: 'monthly', amount: 99900, currency: 'INR', currentPeriodStart: iso(0), currentPeriodEnd: iso(30), gateway: 'mock_test', gatewayOrderId: body.orderId, gatewayPaymentId: body.paymentId } };
    }],

    /* -------------------------- bid score ------------------------- */
    ['post', '/bid-score/evaluate', ({ headers, body }) => {
      if (!isAuthed(headers)) throw httpError(401, { error: 'Sign in to evaluate bid probability.', requireLogin: true });
      const t = resolveTender(body.tenderId);
      if (!t) throw httpError(404, { error: 'Target tender could not be found.' });
      const inputs = {
        registrationClass: body.registrationClass, maxAnnualTurnover: Number(body.maxAnnualTurnover) || 0, ongoingCommitments: Number(body.ongoingCommitments) || 0,
        largestSimilarWork: Number(body.largestSimilarWork) || 0, proposedQuotePercentage: Number(body.proposedQuotePercentage) || 0,
        hasMachineryEquipment: Boolean(body.hasMachineryEquipment), hasValidGstClearance: Boolean(body.hasValidGstClearance),
        hasRegistrationCardRenewal: Boolean(body.hasRegistrationCardRenewal), hasActiveCdrFdrFacility: Boolean(body.hasActiveCdrFdrFacility),
      };
      const results = evaluateBid(t, inputs);
      const tenderSnapshot = { sourceTenderId: t.sourceTenderId, title: t.title, departmentName: t.departmentName, estimatedValue: t.estimatedValue, tendererClass: t.tendererClass, periodOfWorkDays: t.periodOfWorkDays, location: t.location, sourcePortal: t.sourcePortal };
      const record = { _id: oid(`e${Date.now().toString().slice(-3)}`), userId: currentUser().id, tenderId: t._id, contractorProfileId: getState().contractorProfile._id, tenderSnapshot, inputs, results, createdAt: iso(0), updatedAt: iso(0) };
      saveState((st) => {
        st.bidHistory.unshift(record);
        if (body.saveAsDefaultProfile) {
          st.contractorProfile.registrationClass = inputs.registrationClass || st.contractorProfile.registrationClass;
          st.contractorProfile.financialMetrics = { ...st.contractorProfile.financialMetrics, maxAnnualTurnover: inputs.maxAnnualTurnover, ongoingCommitments: inputs.ongoingCommitments, largestSimilarWork: inputs.largestSimilarWork, hasMachineryEquipment: inputs.hasMachineryEquipment, hasValidGstClearance: inputs.hasValidGstClearance, hasRegistrationCardRenewal: inputs.hasRegistrationCardRenewal, hasActiveCdrFdrFacility: inputs.hasActiveCdrFdrFacility, lastUpdated: iso(0) };
        }
      });
      return { success: true, message: 'Bid allocation probability evaluated successfully.', data: { evaluationId: record._id, tender: tenderSnapshot, inputs, results, savedToProfile: Boolean(body.saveAsDefaultProfile) } };
    }],
    ['get', '/bid-score/metrics', ({ headers }) => {
      requireAuth(headers);
      const p = getState().contractorProfile;
      return { success: true, data: { registrationClass: p.registrationClass, financialMetrics: p.financialMetrics } };
    }],
    ['get', '/bid-score/history', ({ headers }) => { requireAuth(headers); const h = getState().bidHistory; return { success: true, count: h.length, data: h }; }],
    ['delete', '/bid-score/history/:id', ({ headers, params }) => {
      requireAuth(headers);
      let found = false;
      saveState((st) => { const i = st.bidHistory.findIndex((r) => r._id === params.id); if (i >= 0) { st.bidHistory.splice(i, 1); found = true; } });
      if (!found) throw httpError(404, { error: 'Evaluation record not found.' });
      return { success: true, message: 'Evaluation record deleted successfully.' };
    }],

    /* ------------------------ notifications ----------------------- */
    ['get', '/notifications/preferences', ({ headers }) => { requireAuth(headers); return { success: true, preferences: getState().notificationPrefs }; }],
    ['put', '/notifications/preferences', ({ headers, body }) => {
      requireAuth(headers);
      const s = saveState((st) => { st.notificationPrefs = { ...st.notificationPrefs, ...body }; });
      return { success: true, message: 'Notification preferences updated successfully.', preferences: s.notificationPrefs };
    }],
    ['post', '/notifications/test', ({ headers, body }) => {
      requireAuth(headers);
      return { success: true, message: `Test alert dispatched to ${body.phone || getState().notificationPrefs.whatsappPhone} (mock, nothing was sent).`, result: { success: true, isMock: true } };
    }],
  ];
}

/** Dev mock of GET /seo/landing/pmgsy[/:state] (see getPmgsyLanding in backend landing.service.js). */
function mockPmgsyLanding(stateSlug, deptSlug) {
  if (deptSlug) throw httpError(404, { error: 'Page not found' });
  const open = STATE_TENDERS.filter((t) => t.scheme === 'PMGSY' && statusBucket(t) === 'active');
  const states = LANDING_STATES
    .map((s) => ({ slug: s.slug, name: s.name, count: open.filter((t) => t.state === s.name).length }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);
  const state = stateSlug ? LANDING_STATES.find((s) => s.slug === stateSlug) : null;
  if (stateSlug && (!state || !states.some((s) => s.slug === stateSlug))) throw httpError(404, { error: 'Page not found' });
  const tenders = state ? open.filter((t) => t.state === state.name) : open;
  const heading = state ? `PMGSY Tenders in ${state.name}` : 'PMGSY Rural Road Tenders';
  return {
    kind: 'pmgsy',
    state,
    department: null,
    total: tenders.length,
    tenders: tenders.map(toSummary),
    departments: [],
    states: states.filter((s) => s.slug !== stateSlug),
    seo: { heading, title: heading, description: `${tenders.length} open ${heading.toLowerCase()} (mock data).` },
    path: `/pmgsy-tenders${state ? `/in/${state.slug}` : ''}`,
  };
}

/** Dev mock of GET /seo/landing/:kind/:state[/:dept] (see backend landing.service.js). */
function mockLanding(kind, stateSlug, deptSlug) {
  if (kind === 'pmgsy') return mockPmgsyLanding(stateSlug, deptSlug);
  const state = LANDING_STATES.find((s) => s.slug === stateSlug);
  if (!state || (kind === 'gem' && deptSlug)) throw httpError(404, { error: 'Page not found' });
  const gem = kind === 'gem';
  const inState = (gem ? GEM_BIDS : STATE_TENDERS).filter((t) => statusBucket(t) === 'active'
    && (gem ? (t.consigneeStates || []).includes(state.name) || t.state === state.name : t.state === state.name));
  const counts = new Map();
  for (const t of inState) if (t.departmentName) counts.set(t.departmentName, (counts.get(t.departmentName) || 0) + 1);
  const departments = gem ? [] : [...counts].map(([name, count]) => ({ slug: slugify(name), name, count })).sort((a, b) => b.count - a.count);
  const department = deptSlug ? departments.find((d) => d.slug === deptSlug) : null;
  if (deptSlug && !department) throw httpError(404, { error: 'Page not found' });
  const tenders = department ? inState.filter((t) => t.departmentName === department.name) : inState;
  const heading = gem ? `GeM Bids in ${state.name}` : department ? `${department.name} Tenders in ${state.name}` : `Government Tenders in ${state.name}`;
  return {
    kind: gem ? 'gem' : 'tenders',
    state,
    department,
    total: tenders.length,
    tenders: tenders.map(toSummary),
    departments: departments.filter((d) => d.slug !== deptSlug),
    categories: gem ? [...new Set(inState.map((t) => t.productCategory).filter(Boolean))].map((name) => ({ name, count: inState.filter((t) => t.productCategory === name).length })) : undefined,
    seo: { heading, title: heading, description: `${tenders.length} open ${heading.toLowerCase()} (mock data).` },
    path: `/${gem ? 'gem-tenders' : 'tenders'}/in/${state.slug}${department ? `/${department.slug}` : ''}`,
  };
}

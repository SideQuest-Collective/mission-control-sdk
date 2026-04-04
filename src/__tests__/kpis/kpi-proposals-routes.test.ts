import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { KpiRuntimeStore } from '../../kpis/kpi-runtime-store.js';
import type { ActiveKpi, KpiProposalRecord } from '../../kpis/types.js';
import { createKpiProposalsRouter, MAX_DYNAMIC_KPIS } from '../../backend/routes/kpi-proposals.js';

// Minimal mock router for capturing handlers
function createMockRouter() {
  const routes: Record<string, Record<string, Function>> = { get: {}, post: {}, delete: {} };
  return {
    get(path: string, handler: Function) { routes.get[path] = handler; },
    post(path: string, handler: Function) { routes.post[path] = handler; },
    delete(path: string, handler: Function) { routes.delete[path] = handler; },
    routes,
  };
}

function mockRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = vi.fn((code: number) => { res.statusCode = code; return res; });
  res.json = vi.fn((body: any) => { res.body = body; });
  return res;
}

function makeStore(overrides: Partial<KpiRuntimeStore> = {}): KpiRuntimeStore {
  return {
    listActive: vi.fn(async () => []),
    getActive: vi.fn(async () => null),
    activate: vi.fn(async () => {}),
    deactivate: vi.fn(async () => {}),
    countActive: vi.fn(async () => 0),
    createProposal: vi.fn(async () => {}),
    getProposal: vi.fn(async () => null),
    listProposals: vi.fn(async () => []),
    transitionProposal: vi.fn(async () => {}),
    expireStaleProposals: vi.fn(async () => 0),
    castVote: vi.fn(async () => {}),
    listVotes: vi.fn(async () => []),
    countVotes: vi.fn(async () => ({ approve: 0, reject: 0 })),
    catalogList: vi.fn(async () => []),
    catalogGet: vi.fn(async () => null),
    catalogUpsert: vi.fn(async () => {}),
    catalogTransition: vi.fn(async () => {}),
    catalogMarkReused: vi.fn(async () => {}),
    catalogExportSnapshot: vi.fn(async () => []),
    ...overrides,
  };
}

const validProposalBody = {
  kpi: { id: 'test-kpi', name: 'Test KPI', category: 'flow', unit: 'count', scope: 'agent', agent_id: 'agent-1', description: 'desc' },
  pipeline: { version: 1, sources: [{ family: 'run.ended' }], aggregation: { type: 'count' }, window: '1h', output_unit: 'count' },
  reason: 'needed for tracking',
};

describe('KPI Proposals Router', () => {
  describe('POST /propose', () => {
    it('creates a proposal and returns 201', async () => {
      const store = makeStore();
      const router = createMockRouter();
      const onProposed = vi.fn();
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5, onProposed })(router);

      const res = mockRes();
      await router.routes.post['/propose']({ body: validProposalBody }, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.body.proposal_id).toMatch(/^kpi-prop-/);
      expect(store.createProposal).toHaveBeenCalledTimes(1);
      expect(store.castVote).toHaveBeenCalledTimes(1); // auto-approve
      expect(onProposed).toHaveBeenCalledTimes(1);
    });

    it('rejects when at capacity without replaces', async () => {
      const store = makeStore({ countActive: vi.fn(async () => MAX_DYNAMIC_KPIS) });
      const router = createMockRouter();
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5 })(router);

      const res = mockRes();
      await router.routes.post['/propose']({ body: validProposalBody }, res);
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.body.error).toContain('capacity');
    });

    it('rejects duplicate active KPI ID', async () => {
      const store = makeStore({
        getActive: vi.fn(async () => ({ id: 'test-kpi' } as ActiveKpi)),
      });
      const router = createMockRouter();
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5 })(router);

      const res = mockRes();
      await router.routes.post['/propose']({ body: validProposalBody }, res);
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.body.error).toContain('already active');
    });

    it('returns 400 for missing fields', async () => {
      const store = makeStore();
      const router = createMockRouter();
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5 })(router);

      const res = mockRes();
      await router.routes.post['/propose']({ body: {} }, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('POST /proposals/:id/vote', () => {
    const pendingProposal: KpiProposalRecord = {
      id: 'prop-1', team_slug: 'team-a', status: 'pending',
      proposal: validProposalBody as any,
      created_at: '2026-04-03T00:00:00.000Z', expires_at: '2026-04-04T00:00:00.000Z',
    };

    it('records an approve vote', async () => {
      const store = makeStore({
        getProposal: vi.fn(async () => pendingProposal),
        countVotes: vi.fn(async () => ({ approve: 1, reject: 0 })),
      });
      const router = createMockRouter();
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5 })(router);

      const res = mockRes();
      await router.routes.post['/proposals/:id/vote'](
        { params: { id: 'prop-1' }, body: { vote: 'approve', voter_id: 'agent-2', voter_type: 'agent' } },
        res,
      );
      expect(store.castVote).toHaveBeenCalledTimes(1);
      expect(res.body.status).toBe('pending');
    });

    it('transitions to rejected on reject vote', async () => {
      const store = makeStore({
        getProposal: vi.fn(async () => pendingProposal),
      });
      const router = createMockRouter();
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5 })(router);

      const res = mockRes();
      await router.routes.post['/proposals/:id/vote'](
        { params: { id: 'prop-1' }, body: { vote: 'reject', voter_id: 'agent-2' } },
        res,
      );
      expect(store.transitionProposal).toHaveBeenCalledWith('prop-1', 'rejected', expect.any(String));
      expect(res.body.status).toBe('rejected');
    });

    it('transitions to operator_pending when agent quorum met', async () => {
      const store = makeStore({
        getProposal: vi.fn(async () => pendingProposal),
        countVotes: vi.fn(async () => ({ approve: 3, reject: 0 })),
        listVotes: vi.fn(async () => []),
      });
      const router = createMockRouter();
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5 })(router);

      const res = mockRes();
      await router.routes.post['/proposals/:id/vote'](
        { params: { id: 'prop-1' }, body: { vote: 'approve', voter_id: 'agent-3', voter_type: 'agent' } },
        res,
      );
      expect(store.transitionProposal).toHaveBeenCalledWith('prop-1', 'operator_pending');
      expect(res.body.status).toBe('operator_pending');
    });

    it('activates when both gates pass', async () => {
      const store = makeStore({
        getProposal: vi.fn(async () => ({ ...pendingProposal, status: 'operator_pending' })),
        countVotes: vi.fn(async () => ({ approve: 3, reject: 0 })),
        listVotes: vi.fn(async () => [
          { proposal_id: 'prop-1', voter_id: 'operator', voter_type: 'operator', vote: 'approve', voted_at: '2026-04-03T01:00:00.000Z' },
        ]),
      });
      const onActivated = vi.fn();
      const router = createMockRouter();
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5, onActivated })(router);

      const res = mockRes();
      await router.routes.post['/proposals/:id/vote'](
        { params: { id: 'prop-1' }, body: { vote: 'approve', voter_id: 'agent-3', voter_type: 'agent' } },
        res,
      );
      expect(store.activate).toHaveBeenCalledTimes(1);
      expect(onActivated).toHaveBeenCalledTimes(1);
      expect(res.body.status).toBe('active');
    });

    it('returns 404 for unknown proposal', async () => {
      const store = makeStore();
      const router = createMockRouter();
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5 })(router);

      const res = mockRes();
      await router.routes.post['/proposals/:id/vote'](
        { params: { id: 'nope' }, body: { vote: 'approve', voter_id: 'agent-1' } },
        res,
      );
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('GET /capacity', () => {
    it('returns capacity info', async () => {
      const store = makeStore({ countActive: vi.fn(async () => 7) });
      const router = createMockRouter();
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5 })(router);

      const res = mockRes();
      await router.routes.get['/capacity']({}, res);
      expect(res.body).toEqual({ active: 7, max: 10, remaining: 3 });
    });
  });

  describe('DELETE /:id', () => {
    it('deactivates and archives', async () => {
      const store = makeStore({
        getActive: vi.fn(async () => ({ id: 'kpi-1' } as ActiveKpi)),
      });
      const router = createMockRouter();
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5 })(router);

      const res = mockRes();
      await router.routes.delete['/:id']({ params: { id: 'kpi-1' } }, res);
      expect(store.deactivate).toHaveBeenCalledWith('team-a', 'kpi-1');
      expect(store.catalogTransition).toHaveBeenCalledWith('team-a', 'kpi-1', 'archived');
      expect(res.body.ok).toBe(true);
    });

    it('returns 404 for non-active KPI', async () => {
      const store = makeStore();
      const router = createMockRouter();
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5 })(router);

      const res = mockRes();
      await router.routes.delete['/:id']({ params: { id: 'nope' } }, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});

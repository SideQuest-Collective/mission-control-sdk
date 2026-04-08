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
    setProposalReplacement: vi.fn(async () => {}),
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

function makeAgentReq(
  body: unknown,
  agentId = 'agent-1',
  params: Record<string, string> = {},
) {
  return {
    params,
    body,
    headers: { authorization: 'Bearer agent-token', 'x-agent-id': agentId },
  };
}

function makeOperatorReq(params: Record<string, string>, body: unknown) {
  return {
    params,
    body,
    headers: { authorization: 'Bearer operator-token' },
  };
}

function makeResolveActor() {
  return (req: any) => {
    if (req.headers?.authorization === 'Bearer operator-token') {
      return { id: 'operator', type: 'operator' as const };
    }
    if (req.headers?.authorization === 'Bearer agent-token') {
      return { id: req.headers['x-agent-id'] ?? 'agent-1', type: 'agent' as const };
    }
    return null;
  };
}

describe('KPI Proposals Router', () => {
  describe('POST /propose', () => {
    it('creates a proposal and returns 201', async () => {
      const store = makeStore();
      const router = createMockRouter();
      const onProposed = vi.fn();
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5, onProposed, resolveActor: makeResolveActor() })(router);

      const res = mockRes();
      await router.routes.post['/propose'](makeAgentReq(validProposalBody), res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.body.proposal_id).toMatch(/^kpi-prop-/);
      expect(store.expireStaleProposals).toHaveBeenCalledTimes(1);
      expect(store.createProposal).toHaveBeenCalledTimes(1);
      expect(store.castVote).toHaveBeenCalledTimes(1); // auto-approve
      expect(onProposed).toHaveBeenCalledTimes(1);
    });

    it('rejects when at capacity without replaces', async () => {
      const store = makeStore({ countActive: vi.fn(async () => MAX_DYNAMIC_KPIS) });
      const router = createMockRouter();
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5, resolveActor: makeResolveActor() })(router);

      const res = mockRes();
      await router.routes.post['/propose'](makeAgentReq(validProposalBody), res);
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.body.error).toContain('Select a KPI to replace before proposing');
      expect(store.createProposal).not.toHaveBeenCalled();
    });

    it('allows capacity-bound proposals when they nominate an active replacement', async () => {
      const store = makeStore({
        countActive: vi.fn(async () => MAX_DYNAMIC_KPIS),
        getActive: vi.fn(async (_teamSlug: string, kpiId: string) => (
          kpiId === 'replacement-kpi' ? ({ id: 'replacement-kpi' } as ActiveKpi) : null
        )),
      });
      const router = createMockRouter();
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5, resolveActor: makeResolveActor() })(router);

      const res = mockRes();
      await router.routes.post['/propose'](
        makeAgentReq({ ...validProposalBody, replaces: 'replacement-kpi' }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(201);
      expect(store.createProposal).toHaveBeenCalledTimes(1);
    });

    it('rejects duplicate active KPI ID', async () => {
      const store = makeStore({
        getActive: vi.fn(async () => ({ id: 'test-kpi' } as ActiveKpi)),
      });
      const router = createMockRouter();
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5, resolveActor: makeResolveActor() })(router);

      const res = mockRes();
      await router.routes.post['/propose'](makeAgentReq(validProposalBody), res);
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.body.error).toContain('already active');
    });

    it('rejects replacements that are not active dynamic KPIs', async () => {
      const store = makeStore({
        getActive: vi.fn(async (_teamSlug: string, kpiId: string) => (
          kpiId === 'replacement-kpi' ? null : null
        )),
      });
      const router = createMockRouter();
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5, resolveActor: makeResolveActor() })(router);

      const res = mockRes();
      await router.routes.post['/propose'](
        makeAgentReq({ ...validProposalBody, replaces: 'replacement-kpi' }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.body.error).toContain('Replacement KPI');
    });

    it('auto-counts the proposer vote for team-scoped KPIs via proposed_by', async () => {
      const store = makeStore();
      const router = createMockRouter();
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5, resolveActor: makeResolveActor() })(router);

      const res = mockRes();
      await router.routes.post['/propose'](
        makeAgentReq({
          ...validProposalBody,
          kpi: { ...validProposalBody.kpi, scope: 'team', agent_id: undefined },
        }, 'agent-9'),
        res,
      );

      expect(store.castVote).toHaveBeenCalledWith(expect.objectContaining({
        voter_id: 'agent-9',
        voter_type: 'agent',
        vote: 'approve',
      }));
    });

    it('ignores client-supplied proposed_by in favor of the authenticated actor', async () => {
      const store = makeStore();
      const router = createMockRouter();
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5, resolveActor: makeResolveActor() })(router);

      const res = mockRes();
      await router.routes.post['/propose'](
        makeAgentReq({
          ...validProposalBody,
          kpi: {
            ...validProposalBody.kpi,
            scope: 'team',
            agent_id: undefined,
          },
          proposed_by: 'operator',
        }, 'agent-7'),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(201);
      expect(store.createProposal).toHaveBeenCalledWith(expect.objectContaining({
        proposal: expect.objectContaining({
          proposed_by: 'agent-7',
        }),
      }));
    });

    it('returns 400 for missing fields', async () => {
      const store = makeStore();
      const router = createMockRouter();
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5, resolveActor: makeResolveActor() })(router);

      const res = mockRes();
      await router.routes.post['/propose'](makeAgentReq({}), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for invalid pipeline descriptors', async () => {
      const store = makeStore();
      const router = createMockRouter();
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5, resolveActor: makeResolveActor() })(router);

      const res = mockRes();
      await router.routes.post['/propose'](
        makeAgentReq({
          ...validProposalBody,
          pipeline: {
            ...validProposalBody.pipeline,
            sources: [{ family: 'unsupported.family' }],
          },
        }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.body.error).toContain('Invalid pipeline');
      expect(store.createProposal).not.toHaveBeenCalled();
    });

    it('rejects duplicate in-flight proposal IDs for the same KPI', async () => {
      const store = makeStore({
        listProposals: vi.fn(async () => [{
          id: 'prop-1',
          team_slug: 'team-a',
          proposal: validProposalBody as any,
          status: 'pending',
          created_at: '2026-04-03T00:00:00.000Z',
          expires_at: '2026-04-04T00:00:00.000Z',
        }]),
      });
      const router = createMockRouter();
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5, resolveActor: makeResolveActor() })(router);

      const res = mockRes();
      await router.routes.post['/propose'](makeAgentReq(validProposalBody), res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.body.error).toContain('in-flight proposal');
      expect(store.createProposal).not.toHaveBeenCalled();
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
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5, resolveActor: makeResolveActor() })(router);

      const res = mockRes();
      await router.routes.post['/proposals/:id/vote'](
        makeAgentReq({ vote: 'approve' }, 'agent-2', { id: 'prop-1' }),
        res,
      );
      expect(store.expireStaleProposals).toHaveBeenCalledTimes(1);
      expect(store.castVote).toHaveBeenCalledTimes(1);
      expect(res.body.status).toBe('pending');
    });

    it('rejects spoofed operator votes without authenticated actor resolution', async () => {
      const store = makeStore({
        getProposal: vi.fn(async () => pendingProposal),
      });
      const router = createMockRouter();
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5, resolveActor: makeResolveActor() })(router);

      const res = mockRes();
      await router.routes.post['/proposals/:id/vote'](
        {
          params: { id: 'prop-1' },
          body: {
            vote: 'approve',
            voter_id: 'operator',
            voter_type: 'operator',
          },
          headers: {},
        },
        res,
      );

      expect(res.status).toHaveBeenCalledWith(401);
      expect(store.castVote).not.toHaveBeenCalled();
    });

    it('ignores client-supplied voter identity fields in favor of the authenticated actor', async () => {
      const store = makeStore({
        getProposal: vi.fn(async () => pendingProposal),
        countVotes: vi.fn(async () => ({ approve: 1, reject: 0 })),
      });
      const router = createMockRouter();
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5, resolveActor: makeResolveActor() })(router);

      const res = mockRes();
      await router.routes.post['/proposals/:id/vote'](
        makeAgentReq({
          vote: 'approve',
          voter_id: 'operator',
          voter_type: 'operator',
        }, 'agent-7', { id: 'prop-1' }),
        res,
      );

      expect(store.castVote).toHaveBeenCalledWith(expect.objectContaining({
        proposal_id: 'prop-1',
        voter_id: 'agent-7',
        voter_type: 'agent',
        vote: 'approve',
      }));
    });

    it('blocks votes on expired proposals after expiring stale records', async () => {
      const expiredProposal: KpiProposalRecord = {
        ...pendingProposal,
        status: 'expired',
      };
      const store = makeStore({
        expireStaleProposals: vi.fn(async () => 1),
        getProposal: vi.fn(async () => expiredProposal),
      });
      const router = createMockRouter();
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5, resolveActor: makeResolveActor() })(router);

      const res = mockRes();
      await router.routes.post['/proposals/:id/vote'](
        makeAgentReq({ vote: 'approve' }, 'agent-2', { id: 'prop-1' }),
        res,
      );

      expect(store.expireStaleProposals).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.body.error).toContain('expired');
      expect(store.castVote).not.toHaveBeenCalled();
    });

    it('transitions to rejected on reject vote', async () => {
      const store = makeStore({
        getProposal: vi.fn(async () => pendingProposal),
      });
      const router = createMockRouter();
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5, resolveActor: makeResolveActor() })(router);

      const res = mockRes();
      await router.routes.post['/proposals/:id/vote'](
        makeAgentReq({ vote: 'reject' }, 'agent-2', { id: 'prop-1' }),
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
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5, resolveActor: makeResolveActor() })(router);

      const res = mockRes();
      await router.routes.post['/proposals/:id/vote'](
        makeAgentReq({ vote: 'approve' }, 'agent-3', { id: 'prop-1' }),
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
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5, onActivated, resolveActor: makeResolveActor() })(router);

      const res = mockRes();
      await router.routes.post['/proposals/:id/vote'](
        makeAgentReq({ vote: 'approve' }, 'agent-3', { id: 'prop-1' }),
        res,
      );
      expect(store.activate).toHaveBeenCalledTimes(1);
      expect(onActivated).toHaveBeenCalledTimes(1);
      expect(res.body.status).toBe('active');
    });

    it('returns 404 for unknown proposal', async () => {
      const store = makeStore();
      const router = createMockRouter();
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5, resolveActor: makeResolveActor() })(router);

      const res = mockRes();
      await router.routes.post['/proposals/:id/vote'](
        makeAgentReq({ vote: 'approve' }, 'agent-1', { id: 'nope' }),
        res,
      );
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('requires operator replacement selection when approving at capacity', async () => {
      const store = makeStore({
        countActive: vi.fn(async () => MAX_DYNAMIC_KPIS),
        getProposal: vi.fn(async () => pendingProposal),
      });
      const router = createMockRouter();
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5, resolveActor: makeResolveActor() })(router);

      const res = mockRes();
      await router.routes.post['/proposals/:id/vote'](
        makeOperatorReq({ id: 'prop-1' }, { vote: 'approve' }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.body.error).toContain('Select a KPI to replace');
    });

    it('persists operator-selected replacement before approval', async () => {
      const proposal = { ...pendingProposal, status: 'operator_pending' };
      const store = makeStore({
        countActive: vi.fn(async () => MAX_DYNAMIC_KPIS),
        getProposal: vi.fn(async () => proposal),
        getActive: vi.fn(async () => ({ id: 'old-kpi' } as ActiveKpi)),
        countVotes: vi.fn(async () => ({ approve: 3, reject: 0 })),
        listVotes: vi.fn(async () => [
          { proposal_id: 'prop-1', voter_id: 'operator', voter_type: 'operator', vote: 'approve', voted_at: '2026-04-03T01:00:00.000Z' },
        ]),
      });
      const router = createMockRouter();
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5, resolveActor: makeResolveActor() })(router);

      const res = mockRes();
      await router.routes.post['/proposals/:id/vote'](
        makeOperatorReq({ id: 'prop-1' }, { vote: 'approve', replaces: 'old-kpi' }),
        res,
      );

      expect(store.setProposalReplacement).toHaveBeenCalledWith('prop-1', 'old-kpi');
    });
  });

  describe('GET /capacity', () => {
    it('returns capacity info', async () => {
      const store = makeStore({ countActive: vi.fn(async () => 7) });
      const router = createMockRouter();
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5, resolveActor: makeResolveActor() })(router);

      const res = mockRes();
      await router.routes.get['/capacity']({}, res);
      expect(store.expireStaleProposals).toHaveBeenCalledTimes(1);
      expect(res.body).toEqual({ active: 7, max: 10, remaining: 3 });
    });
  });

  describe('DELETE /:id', () => {
    it('requires operator authentication', async () => {
      const store = makeStore({
        getActive: vi.fn(async () => ({ id: 'kpi-1' } as ActiveKpi)),
      });
      const router = createMockRouter();
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5, resolveActor: makeResolveActor() })(router);

      const res = mockRes();
      await router.routes.delete['/:id']({
        params: { id: 'kpi-1' },
        headers: { authorization: 'Bearer agent-token', 'x-agent-id': 'agent-1' },
      }, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(store.deactivate).not.toHaveBeenCalled();
    });

    it('deactivates and archives', async () => {
      const store = makeStore({
        getActive: vi.fn(async () => ({ id: 'kpi-1' } as ActiveKpi)),
      });
      const router = createMockRouter();
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5, resolveActor: makeResolveActor() })(router);

      const res = mockRes();
      await router.routes.delete['/:id'](makeOperatorReq({ id: 'kpi-1' }, undefined), res);
      expect(store.deactivate).toHaveBeenCalledWith('team-a', 'kpi-1');
      expect(store.catalogTransition).toHaveBeenCalledWith('team-a', 'kpi-1', 'archived');
      expect(res.body.ok).toBe(true);
    });

    it('returns 404 for non-active KPI', async () => {
      const store = makeStore();
      const router = createMockRouter();
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5, resolveActor: makeResolveActor() })(router);

      const res = mockRes();
      await router.routes.delete['/:id'](makeOperatorReq({ id: 'nope' }, undefined), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('GET /active', () => {
    it('returns active dynamic KPIs', async () => {
      const store = makeStore({ listActive: vi.fn(async () => [{ id: 'kpi-1' } as ActiveKpi]) });
      const router = createMockRouter();
      createKpiProposalsRouter({ store, teamSlug: 'team-a', rosterSize: 5, resolveActor: makeResolveActor() })(router);

      const res = mockRes();
      await router.routes.get['/active']({}, res);
      expect(res.body.active).toHaveLength(1);
    });
  });
});

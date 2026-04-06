import { describe, it, expect, vi } from 'vitest';
import type { KpiRuntimeStore } from '../../kpis/kpi-runtime-store.js';
import type { KpiProposalRecord } from '../../kpis/types.js';
import { evaluateApproval, type KpiProposalsRouterDeps } from '../../backend/routes/kpi-proposals.js';

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

function makeDeps(store: KpiRuntimeStore, rosterSize = 5): KpiProposalsRouterDeps {
  return {
    store,
    teamSlug: 'team-a',
    rosterSize,
    onActivated: vi.fn(),
    onProposed: vi.fn(),
  };
}

const baseProposal: KpiProposalRecord = {
  id: 'prop-1',
  team_slug: 'team-a',
  proposal: {
    kpi: { id: 'kpi-new', name: 'New KPI', category: 'flow', unit: 'count', scope: 'team', description: 'desc' },
    pipeline: { version: 1, sources: [{ family: 'run.ended' }], aggregation: { type: 'count' }, window: '1h', output_unit: 'count' },
    reason: 'testing',
  },
  status: 'pending',
  created_at: '2026-04-03T00:00:00.000Z',
  expires_at: '2026-04-04T00:00:00.000Z',
};

describe('Approval State Machine', () => {
  describe('pending → stays pending', () => {
    it('stays pending with insufficient agent votes and no operator', async () => {
      const store = makeStore({
        countVotes: vi.fn(async () => ({ approve: 1, reject: 0 })),
        listVotes: vi.fn(async () => []),
      });
      const result = await evaluateApproval(makeDeps(store), 'prop-1', baseProposal, 'agent');
      expect(result).toBe('pending');
    });
  });

  describe('pending → team_voted (operator approved first)', () => {
    it('transitions to team_voted when operator approves but no agent quorum', async () => {
      const store = makeStore({
        countVotes: vi.fn(async () => ({ approve: 1, reject: 0 })),
        listVotes: vi.fn(async () => [
          { proposal_id: 'prop-1', voter_id: 'operator', voter_type: 'operator', vote: 'approve', voted_at: '2026-04-03T01:00:00.000Z' },
        ]),
      });
      const result = await evaluateApproval(makeDeps(store), 'prop-1', baseProposal, 'operator');
      expect(result).toBe('team_voted');
      expect(store.transitionProposal).toHaveBeenCalledWith('prop-1', 'team_voted');
    });
  });

  describe('pending → operator_pending (agent quorum first)', () => {
    it('transitions to operator_pending when agent quorum met but no operator', async () => {
      const store = makeStore({
        countVotes: vi.fn(async () => ({ approve: 3, reject: 0 })), // 3/5 = majority
        listVotes: vi.fn(async () => []),
      });
      const result = await evaluateApproval(makeDeps(store), 'prop-1', baseProposal, 'agent');
      expect(result).toBe('operator_pending');
      expect(store.transitionProposal).toHaveBeenCalledWith('prop-1', 'operator_pending');
    });
  });

  describe('operator_pending → active (operator approves)', () => {
    it('activates when operator approves after agent quorum', async () => {
      const store = makeStore({
        countVotes: vi.fn(async () => ({ approve: 3, reject: 0 })),
        listVotes: vi.fn(async () => [
          { proposal_id: 'prop-1', voter_id: 'operator', voter_type: 'operator', vote: 'approve', voted_at: '2026-04-03T02:00:00.000Z' },
        ]),
      });
      const deps = makeDeps(store);
      const result = await evaluateApproval(deps, 'prop-1', { ...baseProposal, status: 'operator_pending' }, 'operator');
      expect(result).toBe('active');
      expect(store.activate).toHaveBeenCalledTimes(1);
      expect(deps.onActivated).toHaveBeenCalledTimes(1);
    });
  });

  describe('team_voted → active (agent quorum met after operator)', () => {
    it('activates when agent quorum met after operator already approved', async () => {
      const store = makeStore({
        countVotes: vi.fn(async () => ({ approve: 3, reject: 0 })),
        listVotes: vi.fn(async () => [
          { proposal_id: 'prop-1', voter_id: 'operator', voter_type: 'operator', vote: 'approve', voted_at: '2026-04-03T01:00:00.000Z' },
        ]),
      });
      const deps = makeDeps(store);
      const result = await evaluateApproval(deps, 'prop-1', { ...baseProposal, status: 'team_voted' }, 'agent');
      expect(result).toBe('active');
      expect(store.activate).toHaveBeenCalledTimes(1);
    });
  });

  describe('quorum calculation with different roster sizes', () => {
    it('requires 2/3 for roster of 3', async () => {
      const store = makeStore({
        countVotes: vi.fn(async () => ({ approve: 2, reject: 0 })),
        listVotes: vi.fn(async () => []),
      });
      const result = await evaluateApproval(makeDeps(store, 3), 'prop-1', baseProposal, 'agent');
      expect(result).toBe('operator_pending');
    });

    it('requires 1/1 for solo agent', async () => {
      const store = makeStore({
        countVotes: vi.fn(async () => ({ approve: 1, reject: 0 })),
        listVotes: vi.fn(async () => []),
      });
      const result = await evaluateApproval(makeDeps(store, 1), 'prop-1', baseProposal, 'agent');
      expect(result).toBe('operator_pending');
    });
  });

  describe('replacement flow', () => {
    it('deactivates replaced KPI on activation', async () => {
      const proposalWithReplace: KpiProposalRecord = {
        ...baseProposal,
        replaces_kpi_id: 'old-kpi',
        status: 'operator_pending',
      };
      const store = makeStore({
        getActive: vi.fn(async () => ({ id: 'old-kpi' } as any)),
        countVotes: vi.fn(async () => ({ approve: 3, reject: 0 })),
        listVotes: vi.fn(async () => [
          { proposal_id: 'prop-1', voter_id: 'operator', voter_type: 'operator', vote: 'approve', voted_at: '2026-04-03T02:00:00.000Z' },
        ]),
      });
      const deps = makeDeps(store);
      await evaluateApproval(deps, 'prop-1', proposalWithReplace, 'operator');
      expect(store.deactivate).toHaveBeenCalledWith('team-a', 'old-kpi');
      expect(store.catalogTransition).toHaveBeenCalledWith('team-a', 'old-kpi', 'archived', 'kpi-new');
    });

    it('rejects activation when the replacement KPI is no longer active', async () => {
      const proposalWithReplace: KpiProposalRecord = {
        ...baseProposal,
        replaces_kpi_id: 'old-kpi',
        status: 'operator_pending',
      };
      const store = makeStore({
        getActive: vi.fn(async () => null),
        countVotes: vi.fn(async () => ({ approve: 3, reject: 0 })),
        listVotes: vi.fn(async () => [
          { proposal_id: 'prop-1', voter_id: 'operator', voter_type: 'operator', vote: 'approve', voted_at: '2026-04-03T02:00:00.000Z' },
        ]),
      });

      await expect(
        evaluateApproval(makeDeps(store), 'prop-1', proposalWithReplace, 'operator'),
      ).rejects.toThrow(/no longer active/);
      expect(store.transitionProposal).toHaveBeenCalledWith('prop-1', 'rejected', expect.any(String));
      expect(store.activate).not.toHaveBeenCalled();
    });
  });

  describe('does not re-transition when already in correct state', () => {
    it('skips operator_pending transition if already operator_pending', async () => {
      const store = makeStore({
        countVotes: vi.fn(async () => ({ approve: 3, reject: 0 })),
        listVotes: vi.fn(async () => []),
      });
      const result = await evaluateApproval(
        makeDeps(store), 'prop-1',
        { ...baseProposal, status: 'operator_pending' },
        'agent',
      );
      expect(result).toBe('operator_pending');
      expect(store.transitionProposal).not.toHaveBeenCalled();
    });

    it('skips team_voted transition if already team_voted', async () => {
      const store = makeStore({
        countVotes: vi.fn(async () => ({ approve: 1, reject: 0 })),
        listVotes: vi.fn(async () => [
          { proposal_id: 'prop-1', voter_id: 'operator', voter_type: 'operator', vote: 'approve', voted_at: '2026-04-03T01:00:00.000Z' },
        ]),
      });
      const result = await evaluateApproval(
        makeDeps(store), 'prop-1',
        { ...baseProposal, status: 'team_voted' },
        'agent',
      );
      expect(result).toBe('team_voted');
      expect(store.transitionProposal).not.toHaveBeenCalled();
    });
  });

  describe('catalog entry creation on activation', () => {
    it('upserts catalog entry when KPI is activated', async () => {
      const store = makeStore({
        countVotes: vi.fn(async () => ({ approve: 3, reject: 0 })),
        listVotes: vi.fn(async () => [
          { proposal_id: 'prop-1', voter_id: 'operator', voter_type: 'operator', vote: 'approve', voted_at: '2026-04-03T02:00:00.000Z' },
        ]),
      });
      await evaluateApproval(makeDeps(store), 'prop-1', { ...baseProposal, status: 'operator_pending' }, 'operator');
      expect(store.catalogUpsert).toHaveBeenCalledTimes(1);
      const entry = (store.catalogUpsert as any).mock.calls[0][0];
      expect(entry.id).toBe('kpi-new');
      expect(entry.origin).toBe('runtime_agent');
      expect(entry.status).toBe('active');
    });
  });

  describe('proposal transitions to active status after activation', () => {
    it('transitions proposal from approved to active', async () => {
      const store = makeStore({
        countVotes: vi.fn(async () => ({ approve: 3, reject: 0 })),
        listVotes: vi.fn(async () => [
          { proposal_id: 'prop-1', voter_id: 'operator', voter_type: 'operator', vote: 'approve', voted_at: '2026-04-03T02:00:00.000Z' },
        ]),
      });
      await evaluateApproval(makeDeps(store), 'prop-1', { ...baseProposal, status: 'operator_pending' }, 'operator');
      // Should have two transitionProposal calls: approved, then active
      const calls = (store.transitionProposal as any).mock.calls;
      expect(calls[0][1]).toBe('approved');
      expect(calls[1][1]).toBe('active');
    });
  });
});

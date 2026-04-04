import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import type { ActiveKpi, KpiProposalRecord, KpiProposalVote, KpiCatalogEntry } from '../../kpis/types.js';
import { createKpiRuntimeStore, buildKpiBootstrapStatements } from '../../kpis/kpi-runtime-store.js';

function makePool(queryFn: (...args: any[]) => any): Pool {
  return { query: vi.fn(queryFn) } as unknown as Pool;
}

function qr(rows: any[] = [], rowCount?: number): QueryResult {
  return { rows, rowCount: rowCount ?? rows.length, command: '', oid: 0, fields: [] };
}

const SCHEMA = 'test_schema';

function makeActiveKpi(id = 'kpi-1'): ActiveKpi {
  return {
    id,
    team_slug: 'team-a',
    kpi_definition: { id, name: 'Test KPI', category: 'flow', unit: 'count', description: 'Test', data_source: 'run.ended' },
    pipeline: { version: 1, sources: [{ family: 'run.ended' }], aggregation: { type: 'count' }, window: '1h', output_unit: 'count' },
    widget_descriptor: { id: `widget-${id}`, title: 'Test KPI', primitive: 'stat-card', data_source: id, derived_from: id, config: {}, grid: { w: 1, h: 1 } },
    origin: 'runtime_agent',
    proposed_by: 'agent-1',
    activated_at: '2026-04-03T00:00:00.000Z',
  };
}

function makeProposal(id = 'prop-1'): KpiProposalRecord {
  return {
    id,
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
}

function makeCatalogEntry(id = 'cat-1'): KpiCatalogEntry {
  return {
    id,
    team_slug: 'team-a',
    kpi_definition: { id, name: 'Catalog KPI', category: 'flow', unit: 'count', description: 'Test', data_source: 'run.ended' },
    pipeline: { version: 1, sources: [{ family: 'run.ended' }], aggregation: { type: 'count' }, window: '1h', output_unit: 'count' },
    origin: 'bootstrap_llm',
    first_registered: '2026-04-01T00:00:00.000Z',
    last_active: '2026-04-03T00:00:00.000Z',
    times_bootstrapped: 2,
    status: 'active',
  };
}

describe('buildKpiBootstrapStatements', () => {
  it('returns DDL for 4 tables + 2 indexes', () => {
    const stmts = buildKpiBootstrapStatements('my_schema');
    expect(stmts).toHaveLength(6);
    expect(stmts[0]).toContain('my_schema.kpi_active');
    expect(stmts[1]).toContain('my_schema.kpi_proposals');
    expect(stmts[2]).toContain('idx_kpi_proposals_team_status');
    expect(stmts[3]).toContain('my_schema.kpi_proposal_votes');
    expect(stmts[4]).toContain('my_schema.kpi_catalog');
    expect(stmts[5]).toContain('idx_kpi_catalog_team_status');
  });
});

describe('KpiRuntimeStore', () => {
  describe('listActive', () => {
    it('returns active KPIs mapped from rows', async () => {
      const row = {
        id: 'kpi-1', team_slug: 'team-a',
        kpi_definition: { id: 'kpi-1', name: 'T' },
        pipeline: { version: 1 },
        widget_descriptor: { id: 'w' },
        origin: 'runtime_agent', proposed_by: 'agent-1',
        activated_at: new Date('2026-04-03T00:00:00.000Z'),
      };
      const pool = makePool(() => qr([row]));
      const store = createKpiRuntimeStore(pool, SCHEMA);
      const result = await store.listActive('team-a');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('kpi-1');
      expect(result[0].activated_at).toBe('2026-04-03T00:00:00.000Z');
    });
  });

  describe('getActive', () => {
    it('returns null when not found', async () => {
      const pool = makePool(() => qr([], 0));
      const store = createKpiRuntimeStore(pool, SCHEMA);
      expect(await store.getActive('team-a', 'nope')).toBeNull();
    });
  });

  describe('activate', () => {
    it('calls INSERT with JSONB params', async () => {
      const queryFn = vi.fn(() => qr());
      const pool = makePool(queryFn);
      const store = createKpiRuntimeStore(pool, SCHEMA);
      const kpi = makeActiveKpi();
      await store.activate(kpi);
      expect(queryFn).toHaveBeenCalledTimes(1);
      const [sql, params] = queryFn.mock.calls[0];
      expect(sql).toContain('INSERT INTO');
      expect(sql).toContain('ON CONFLICT');
      expect(params[0]).toBe('kpi-1');
      expect(typeof params[2]).toBe('string'); // JSON.stringify
    });
  });

  describe('deactivate', () => {
    it('calls DELETE with team_slug and id', async () => {
      const queryFn = vi.fn(() => qr());
      const pool = makePool(queryFn);
      const store = createKpiRuntimeStore(pool, SCHEMA);
      await store.deactivate('team-a', 'kpi-1');
      expect(queryFn).toHaveBeenCalledTimes(1);
      expect(queryFn.mock.calls[0][0]).toContain('DELETE FROM');
    });
  });

  describe('countActive', () => {
    it('returns count from query', async () => {
      const pool = makePool(() => qr([{ cnt: 7 }]));
      const store = createKpiRuntimeStore(pool, SCHEMA);
      expect(await store.countActive('team-a')).toBe(7);
    });
  });

  describe('createProposal', () => {
    it('inserts proposal with JSONB', async () => {
      const queryFn = vi.fn(() => qr());
      const pool = makePool(queryFn);
      const store = createKpiRuntimeStore(pool, SCHEMA);
      await store.createProposal(makeProposal());
      expect(queryFn).toHaveBeenCalledTimes(1);
      expect(queryFn.mock.calls[0][0]).toContain('INSERT INTO');
      expect(queryFn.mock.calls[0][1][0]).toBe('prop-1');
    });
  });

  describe('getProposal', () => {
    it('returns null when not found', async () => {
      const pool = makePool(() => qr([], 0));
      const store = createKpiRuntimeStore(pool, SCHEMA);
      expect(await store.getProposal('nope')).toBeNull();
    });
  });

  describe('transitionProposal', () => {
    it('updates status with resolvedAt when provided', async () => {
      const queryFn = vi.fn(() => qr());
      const pool = makePool(queryFn);
      const store = createKpiRuntimeStore(pool, SCHEMA);
      await store.transitionProposal('prop-1', 'approved', '2026-04-03T12:00:00.000Z');
      expect(queryFn.mock.calls[0][0]).toContain('resolved_at');
      expect(queryFn.mock.calls[0][1]).toContain('2026-04-03T12:00:00.000Z');
    });

    it('updates status without resolvedAt', async () => {
      const queryFn = vi.fn(() => qr());
      const pool = makePool(queryFn);
      const store = createKpiRuntimeStore(pool, SCHEMA);
      await store.transitionProposal('prop-1', 'operator_pending');
      expect(queryFn.mock.calls[0][1]).toHaveLength(2);
    });
  });

  describe('castVote', () => {
    it('upserts vote with ON CONFLICT', async () => {
      const queryFn = vi.fn(() => qr());
      const pool = makePool(queryFn);
      const store = createKpiRuntimeStore(pool, SCHEMA);
      await store.castVote({
        proposal_id: 'prop-1', voter_id: 'agent-1', voter_type: 'agent',
        vote: 'approve', voted_at: '2026-04-03T00:00:00.000Z',
      });
      expect(queryFn.mock.calls[0][0]).toContain('ON CONFLICT');
    });
  });

  describe('countVotes', () => {
    it('returns approve/reject counts', async () => {
      const pool = makePool(() => qr([
        { vote: 'approve', cnt: 3 },
        { vote: 'reject', cnt: 1 },
      ]));
      const store = createKpiRuntimeStore(pool, SCHEMA);
      const counts = await store.countVotes('prop-1');
      expect(counts).toEqual({ approve: 3, reject: 1 });
    });

    it('returns zeros when no votes', async () => {
      const pool = makePool(() => qr([]));
      const store = createKpiRuntimeStore(pool, SCHEMA);
      const counts = await store.countVotes('prop-1');
      expect(counts).toEqual({ approve: 0, reject: 0 });
    });
  });

  describe('catalogUpsert', () => {
    it('inserts catalog entry with ON CONFLICT', async () => {
      const queryFn = vi.fn(() => qr());
      const pool = makePool(queryFn);
      const store = createKpiRuntimeStore(pool, SCHEMA);
      await store.catalogUpsert(makeCatalogEntry());
      expect(queryFn.mock.calls[0][0]).toContain('ON CONFLICT');
    });
  });

  describe('catalogList', () => {
    it('filters by status when provided', async () => {
      const queryFn = vi.fn(() => qr([]));
      const pool = makePool(queryFn);
      const store = createKpiRuntimeStore(pool, SCHEMA);
      await store.catalogList('team-a', 'active');
      expect(queryFn.mock.calls[0][0]).toContain('status = $2');
      expect(queryFn.mock.calls[0][1][1]).toBe('active');
    });

    it('lists all when no status filter', async () => {
      const queryFn = vi.fn(() => qr([]));
      const pool = makePool(queryFn);
      const store = createKpiRuntimeStore(pool, SCHEMA);
      await store.catalogList('team-a');
      expect(queryFn.mock.calls[0][0]).not.toContain('status = $2');
    });
  });

  describe('catalogTransition', () => {
    it('sets replaced_by when provided', async () => {
      const queryFn = vi.fn(() => qr());
      const pool = makePool(queryFn);
      const store = createKpiRuntimeStore(pool, SCHEMA);
      await store.catalogTransition('team-a', 'kpi-1', 'archived', 'kpi-2');
      expect(queryFn.mock.calls[0][0]).toContain('replaced_by');
      expect(queryFn.mock.calls[0][1]).toContain('kpi-2');
    });
  });

  describe('catalogMarkReused', () => {
    it('uses ANY($2::text[]) for batch update', async () => {
      const queryFn = vi.fn(() => qr());
      const pool = makePool(queryFn);
      const store = createKpiRuntimeStore(pool, SCHEMA);
      await store.catalogMarkReused('team-a', ['kpi-1', 'kpi-2']);
      expect(queryFn.mock.calls[0][0]).toContain('ANY($2::text[])');
      expect(queryFn.mock.calls[0][1][1]).toEqual(['kpi-1', 'kpi-2']);
    });

    it('skips when kpiIds is empty', async () => {
      const queryFn = vi.fn(() => qr());
      const pool = makePool(queryFn);
      const store = createKpiRuntimeStore(pool, SCHEMA);
      await store.catalogMarkReused('team-a', []);
      expect(queryFn).not.toHaveBeenCalled();
    });
  });
});

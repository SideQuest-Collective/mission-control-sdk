import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { KpiProposalRecord } from '../../kpis/types.js';
import { broadcastKpiProposal } from '../../backend/handlers/kpi-mesh-notifier.js';

const proposal: KpiProposalRecord = {
  id: 'kpi-prop-abc12345',
  team_slug: 'team-a',
  proposal: {
    kpi: {
      id: 'scrape-success-rate',
      name: 'Scrape Success Rate',
      category: 'execution',
      unit: 'percent',
      scope: 'agent',
      agent_id: 'scrape-analyst',
      description: 'Percentage of scrape runs completing without errors',
    },
    pipeline: {
      version: 1,
      sources: [{ family: 'run.ended', filter: { agent_id: 'scrape-analyst' } }],
      aggregation: {
        type: 'rate',
        numerator: { type: 'count_where', predicate: { success: 'true' } },
        denominator: { type: 'count' },
      },
      window: '24h',
      output_unit: 'percent',
    },
    reason: 'Need to track scrape reliability',
  },
  status: 'pending',
  created_at: '2026-04-03T00:00:00.000Z',
  expires_at: '2026-04-04T00:00:00.000Z',
};

describe('broadcastKpiProposal', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends correct message to /mesh/send', async () => {
    let capturedBody: any;
    let capturedUrl: string;
    let capturedHeaders: any;

    globalThis.fetch = vi.fn(async (url: any, opts: any) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(opts.body);
      capturedHeaders = opts.headers;
      return new Response('{}', { status: 200 });
    }) as any;

    await broadcastKpiProposal(proposal, 'http://skynet:8080', 'test-token');

    expect(capturedUrl!).toBe('http://skynet:8080/mesh/send');
    expect(capturedHeaders!.Authorization).toBe('Bearer test-token');
    expect(capturedBody!.to).toBeNull();
    expect(capturedBody!.correlation_id).toBe('kpi-proposal-kpi-prop-abc12345');
  });

  it('formats message with KPI details', async () => {
    let capturedMessage: string;

    globalThis.fetch = vi.fn(async (_url: any, opts: any) => {
      capturedMessage = JSON.parse(opts.body).message;
      return new Response('{}', { status: 200 });
    }) as any;

    await broadcastKpiProposal(proposal, 'http://skynet:8080', 'token');

    expect(capturedMessage!).toContain('[KPI-PROPOSAL::kpi-prop-abc12345]');
    expect(capturedMessage!).toContain('Scrape Success Rate');
    expect(capturedMessage!).toContain('scrape-analyst');
    expect(capturedMessage!).toContain('over 24h');
    expect(capturedMessage!).toContain('POST /api/kpis/proposals/kpi-prop-abc12345/vote');
  });

  it('strips trailing slash from skynetUrl', async () => {
    let capturedUrl: string;

    globalThis.fetch = vi.fn(async (url: any) => {
      capturedUrl = String(url);
      return new Response('{}', { status: 200 });
    }) as any;

    await broadcastKpiProposal(proposal, 'http://skynet:8080/', 'token');
    expect(capturedUrl!).toBe('http://skynet:8080/mesh/send');
  });

  it('throws on non-OK response', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response('bad request', { status: 400 });
    }) as any;

    await expect(
      broadcastKpiProposal(proposal, 'http://skynet:8080', 'token'),
    ).rejects.toThrow('Mesh broadcast failed (400)');
  });
});

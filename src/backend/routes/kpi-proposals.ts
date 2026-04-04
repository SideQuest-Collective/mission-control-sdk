import type { KpiRuntimeStore } from '../../kpis/kpi-runtime-store.js';
import type { ActiveKpi, KpiProposalRecord, KpiProposal } from '../../kpis/types.js';

const MAX_DYNAMIC_KPIS = 10;
const PROPOSAL_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

class RouteError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export interface KpiProposalsRouterDeps {
  store: KpiRuntimeStore;
  teamSlug: string;
  rosterSize: number;
  onActivated?: (kpi: ActiveKpi) => void;
  onProposed?: (proposal: KpiProposalRecord) => void;
}

/**
 * Creates KPI proposal route handlers.
 * Routes: POST /propose, GET /proposals, GET /proposals/:id, POST /proposals/:id/vote,
 *         DELETE /:id, GET /capacity
 */
export function createKpiProposalsRouter(deps: KpiProposalsRouterDeps) {
  return function mount(router: { get: Function; post: Function; delete: Function }): void {
    const expireStale = async (): Promise<void> => {
      await deps.store.expireStaleProposals();
    };

    const getProposerId = (proposal: KpiProposal): string | null => {
      return proposal.proposed_by?.trim() || proposal.kpi.agent_id?.trim() || null;
    };

    const requireValidReplacement = async (kpiId: string): Promise<ActiveKpi> => {
      const replacement = await deps.store.getActive(deps.teamSlug, kpiId);
      if (!replacement) {
        throw new RouteError(`Replacement KPI "${kpiId}" is not an active dynamic KPI`, 409);
      }
      return replacement;
    };

    // POST /propose — Agent submits a KPI proposal
    router.post('/propose', async (req: any, res: any) => {
      try {
        const body = req.body as KpiProposal | undefined;
        if (!body?.kpi?.id || !body?.kpi?.name || !body?.pipeline || !body?.reason) {
          res.status(400).json({ error: 'Missing required fields: kpi.id, kpi.name, pipeline, reason' });
          return;
        }

        if (body.replaces) {
          await requireValidReplacement(body.replaces);
        }

        // Check capacity
        const activeCount = await deps.store.countActive(deps.teamSlug);
        if (activeCount >= MAX_DYNAMIC_KPIS && !body.replaces) {
          res.status(409).json({
            error: `At capacity (${activeCount}/${MAX_DYNAMIC_KPIS}). Must nominate a KPI to replace via "replaces" field.`,
          });
          return;
        }

        // Check for duplicate active KPI ID
        const existing = await deps.store.getActive(deps.teamSlug, body.kpi.id);
        if (existing) {
          res.status(409).json({ error: `KPI "${body.kpi.id}" is already active` });
          return;
        }

        const now = new Date();
        const proposalId = `kpi-prop-${crypto.randomUUID().slice(0, 8)}`;
        const record: KpiProposalRecord = {
          id: proposalId,
          team_slug: deps.teamSlug,
          proposal: body,
          status: 'pending',
          replaces_kpi_id: body.replaces,
          created_at: now.toISOString(),
          expires_at: new Date(now.getTime() + PROPOSAL_TTL_MS).toISOString(),
        };

        await deps.store.createProposal(record);

        // Auto-approve from the proposing agent, including team-scoped proposals.
        const proposerId = getProposerId(body);
        if (proposerId) {
          await deps.store.castVote({
            proposal_id: proposalId,
            voter_id: proposerId,
            voter_type: 'agent',
            vote: 'approve',
            reason: 'Auto-approve by proposer',
            voted_at: now.toISOString(),
          });
        }

        deps.onProposed?.(record);

        res.status(201).json({ proposal_id: proposalId, status: 'pending' });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal error';
        const status = err instanceof RouteError ? err.status : 500;
        res.status(status).json({ error: message });
      }
    });

    // GET /proposals — List proposals (filterable by status)
    router.get('/proposals', async (req: any, res: any) => {
      try {
        await expireStale();
        const status = typeof req.query.status === 'string' ? req.query.status : undefined;
        const proposals = await deps.store.listProposals(deps.teamSlug, status);
        res.json({ proposals });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal error';
        const status = err instanceof RouteError ? err.status : 500;
        res.status(status).json({ error: message });
      }
    });

    // GET /proposals/:id — Get proposal details + votes
    router.get('/proposals/:id', async (req: any, res: any) => {
      try {
        await expireStale();
        const proposal = await deps.store.getProposal(req.params.id);
        if (!proposal) {
          res.status(404).json({ error: 'Proposal not found' });
          return;
        }
        const votes = await deps.store.listVotes(req.params.id);
        res.json({ proposal, votes });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal error';
        const status = err instanceof RouteError ? err.status : 500;
        res.status(status).json({ error: message });
      }
    });

    // POST /proposals/:id/vote — Agent or operator votes
    router.post('/proposals/:id/vote', async (req: any, res: any) => {
      try {
        await expireStale();
        const { vote, voter_id, voter_type, reason } = req.body ?? {};
        if (!vote || !voter_id) {
          res.status(400).json({ error: 'Missing required fields: vote, voter_id' });
          return;
        }
        if (vote !== 'approve' && vote !== 'reject') {
          res.status(400).json({ error: 'vote must be "approve" or "reject"' });
          return;
        }

        const proposal = await deps.store.getProposal(req.params.id);
        if (!proposal) {
          res.status(404).json({ error: 'Proposal not found' });
          return;
        }

        // Can only vote on active proposals
        const votableStatuses = ['pending', 'team_voted', 'operator_pending'];
        if (!votableStatuses.includes(proposal.status)) {
          res.status(409).json({ error: `Proposal is ${proposal.status}, cannot vote` });
          return;
        }

        const vType = voter_type === 'operator' ? 'operator' : 'agent';
        const now = new Date().toISOString();

        // Record the vote
        await deps.store.castVote({
          proposal_id: req.params.id,
          voter_id,
          voter_type: vType,
          vote,
          reason,
          voted_at: now,
        });

        // Handle rejection from any gate
        if (vote === 'reject') {
          await deps.store.transitionProposal(req.params.id, 'rejected', now);
          res.json({ proposal_id: req.params.id, status: 'rejected' });
          return;
        }

        // Check state transitions for approvals
        const newStatus = await evaluateApproval(deps, req.params.id, proposal, vType);
        res.json({ proposal_id: req.params.id, status: newStatus });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal error';
        const status = err instanceof RouteError ? err.status : 500;
        res.status(status).json({ error: message });
      }
    });

    // DELETE /:id — Deactivate a dynamic KPI
    router.delete('/:id', async (req: any, res: any) => {
      try {
        const existing = await deps.store.getActive(deps.teamSlug, req.params.id);
        if (!existing) {
          res.status(404).json({ error: 'Active KPI not found' });
          return;
        }
        await deps.store.deactivate(deps.teamSlug, req.params.id);
        // Archive in catalog
        await deps.store.catalogTransition(deps.teamSlug, req.params.id, 'archived');
        res.json({ ok: true, deactivated: req.params.id });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal error';
        res.status(500).json({ error: message });
      }
    });

    // GET /capacity — Returns { active, max, remaining }
    router.get('/capacity', async (_req: any, res: any) => {
      try {
        await expireStale();
        const active = await deps.store.countActive(deps.teamSlug);
        res.json({ active, max: MAX_DYNAMIC_KPIS, remaining: MAX_DYNAMIC_KPIS - active });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal error';
        const status = err instanceof RouteError ? err.status : 500;
        res.status(status).json({ error: message });
      }
    });
  };
}

// ── Approval state machine ──────────────────────────────────────────────

export async function evaluateApproval(
  deps: KpiProposalsRouterDeps,
  proposalId: string,
  proposal: KpiProposalRecord,
  voterType: 'agent' | 'operator',
): Promise<string> {
  const { approve: agentApproves } = await deps.store.countVotes(proposalId);
  const votes = await deps.store.listVotes(proposalId);
  const operatorApproval = votes.find((v) => v.voter_type === 'operator' && v.vote === 'approve');
  const quorum = Math.floor(deps.rosterSize / 2) + 1; // majority = >50%
  const agentQuorumMet = agentApproves >= quorum;

  const now = new Date().toISOString();

  // Both gates met → activate
  if (agentQuorumMet && operatorApproval) {
    await deps.store.transitionProposal(proposalId, 'approved', now);
    await activateFromProposal(deps, proposal);
    return 'active';
  }

  // Agent quorum met, waiting for operator
  if (agentQuorumMet && !operatorApproval) {
    if (proposal.status !== 'operator_pending') {
      await deps.store.transitionProposal(proposalId, 'operator_pending');
    }
    return 'operator_pending';
  }

  // Operator approved, waiting for agent quorum
  if (!agentQuorumMet && operatorApproval) {
    if (proposal.status !== 'team_voted') {
      await deps.store.transitionProposal(proposalId, 'team_voted');
    }
    return 'team_voted';
  }

  // Still pending
  return proposal.status;
}

async function activateFromProposal(
  deps: KpiProposalsRouterDeps,
  proposal: KpiProposalRecord,
): Promise<void> {
  const kpi = proposal.proposal.kpi;
  const now = new Date().toISOString();
  const proposedBy = proposal.proposal.proposed_by ?? kpi.agent_id;

  // If replacing, deactivate the old KPI first
  if (proposal.replaces_kpi_id) {
    const replacement = await deps.store.getActive(deps.teamSlug, proposal.replaces_kpi_id);
    if (!replacement) {
      await deps.store.transitionProposal(proposal.id, 'rejected', now);
      throw new RouteError(
        `Replacement KPI "${proposal.replaces_kpi_id}" is no longer active`,
        409,
      );
    }
    await deps.store.deactivate(deps.teamSlug, proposal.replaces_kpi_id);
    await deps.store.catalogTransition(deps.teamSlug, proposal.replaces_kpi_id, 'archived', kpi.id);
  }

  const activeKpi: ActiveKpi = {
    id: kpi.id,
    team_slug: deps.teamSlug,
    kpi_definition: {
      id: kpi.id,
      name: kpi.name,
      category: kpi.category,
      unit: kpi.unit,
      description: kpi.description,
      data_source: proposal.proposal.pipeline.sources[0]?.family ?? 'unknown',
    },
    pipeline: proposal.proposal.pipeline,
    widget_descriptor: {
      id: `widget-${kpi.id}`,
      title: kpi.name,
      primitive: kpi.scope === 'agent' ? 'stat-card' : 'sparkline',
      data_source: kpi.id,
      derived_from: kpi.id,
      config: { scope: kpi.scope, agent_id: kpi.agent_id },
      grid: { w: 1, h: 1 },
    },
    origin: 'runtime_agent',
    proposed_by: proposedBy,
    activated_at: now,
  };

  await deps.store.activate(activeKpi);

  // Upsert into catalog
  await deps.store.catalogUpsert({
    id: kpi.id,
    team_slug: deps.teamSlug,
    kpi_definition: activeKpi.kpi_definition,
    pipeline: activeKpi.pipeline,
    origin: 'runtime_agent',
    proposed_by: proposedBy,
    first_registered: now,
    last_active: now,
    times_bootstrapped: 0,
    status: 'active',
  });

  // Transition proposal to active
  await deps.store.transitionProposal(proposal.id, 'active', now);

  deps.onActivated?.(activeKpi);
}

export { MAX_DYNAMIC_KPIS };

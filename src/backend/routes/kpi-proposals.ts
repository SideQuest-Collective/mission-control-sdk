import type { KpiRuntimeStore } from '../../kpis/kpi-runtime-store.js';
import type { ActiveKpi, KpiProposalRecord, KpiProposal } from '../../kpis/types.js';
import { validatePipelineDescriptor } from '../../kpis/validation.js';

const MAX_DYNAMIC_KPIS = 10;
const PROPOSAL_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const IN_FLIGHT_PROPOSAL_STATUSES = new Set(['pending', 'team_voted', 'operator_pending', 'approved']);

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
  resolveActor?: (req: any) => { id: string; type: 'agent' | 'operator' } | null;
  onActivated?: (kpi: ActiveKpi) => void;
  onProposed?: (proposal: KpiProposalRecord) => void;
  onVoteReceived?: (vote: { proposal_id: string; voter_id: string; vote: 'approve' | 'reject' }) => void;
  onDeactivated?: (kpiId: string) => void;
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

    const requireActor = (
      req: any,
      expectedType?: 'agent' | 'operator',
    ): { id: string; type: 'agent' | 'operator' } => {
      const actor = deps.resolveActor?.(req) ?? null;
      if (!actor) {
        throw new RouteError('Missing or invalid authorization for KPI action', 401);
      }
      if (expectedType && actor.type !== expectedType) {
        throw new RouteError(`This action requires ${expectedType} authorization`, 403);
      }
      return actor;
    };

    const requireValidReplacement = async (kpiId: string): Promise<ActiveKpi> => {
      const replacement = await deps.store.getActive(deps.teamSlug, kpiId);
      if (!replacement) {
        throw new RouteError(`Replacement KPI "${kpiId}" is not an active dynamic KPI`, 409);
      }
      return replacement;
    };

    const getTeamScopedProposal = async (proposalId: string): Promise<KpiProposalRecord | null> => {
      const proposal = await deps.store.getProposal(proposalId);
      if (!proposal || proposal.team_slug !== deps.teamSlug) {
        return null;
      }
      return proposal;
    };

    // POST /propose — Agent submits a KPI proposal
    router.post('/propose', async (req: any, res: any) => {
      try {
        await expireStale();
        const actor = requireActor(req, 'agent');
        const body = req.body as KpiProposal | undefined;
        if (!body?.kpi?.id || !body?.kpi?.name || !body?.pipeline || !body?.reason) {
          res.status(400).json({ error: 'Missing required fields: kpi.id, kpi.name, pipeline, reason' });
          return;
        }
        const pipelineErrors = validatePipelineDescriptor(body.pipeline);
        if (pipelineErrors.length > 0) {
          res.status(400).json({ error: `Invalid pipeline: ${pipelineErrors.join('; ')}` });
          return;
        }
        if (body.kpi.scope === 'agent' && body.kpi.agent_id && body.kpi.agent_id !== actor.id) {
          res.status(403).json({ error: 'Agents may only register agent-scoped KPIs for themselves' });
          return;
        }

        const normalizedProposal: KpiProposal = {
          ...body,
          proposed_by: actor.id,
          kpi: {
            ...body.kpi,
            ...(body.kpi.scope === 'agent' ? { agent_id: actor.id } : {}),
          },
        };

        if (normalizedProposal.replaces) {
          await requireValidReplacement(normalizedProposal.replaces);
        }

        // Check capacity
        const activeCount = await deps.store.countActive(deps.teamSlug);
        // Check for duplicate active KPI ID
        const existing = await deps.store.getActive(deps.teamSlug, normalizedProposal.kpi.id);
        if (existing) {
          res.status(409).json({ error: `KPI "${normalizedProposal.kpi.id}" is already active` });
          return;
        }
        const proposals = await deps.store.listProposals(deps.teamSlug);
        const inFlightDuplicate = proposals.find((proposal) => (
          proposal.proposal.kpi.id === normalizedProposal.kpi.id
          && IN_FLIGHT_PROPOSAL_STATUSES.has(proposal.status)
        ));
        if (inFlightDuplicate) {
          res.status(409).json({
            error: `KPI "${normalizedProposal.kpi.id}" already has an in-flight proposal (${inFlightDuplicate.id})`,
          });
          return;
        }
        if (activeCount >= MAX_DYNAMIC_KPIS && !normalizedProposal.replaces) {
          res.status(409).json({
            error: `At capacity (${activeCount}/${MAX_DYNAMIC_KPIS}). Select a KPI to replace before proposing.`,
          });
          return;
        }

        const now = new Date();
        const proposalId = `kpi-prop-${crypto.randomUUID().slice(0, 8)}`;
        const record: KpiProposalRecord = {
          id: proposalId,
          team_slug: deps.teamSlug,
          proposal: normalizedProposal,
          status: 'pending',
          replaces_kpi_id: normalizedProposal.replaces,
          created_at: now.toISOString(),
          expires_at: new Date(now.getTime() + PROPOSAL_TTL_MS).toISOString(),
        };

        await deps.store.createProposal(record);

        // Auto-approve from the proposing agent, including team-scoped proposals.
        await deps.store.castVote({
          proposal_id: proposalId,
          voter_id: actor.id,
          voter_type: 'agent',
          vote: 'approve',
          reason: 'Auto-approve by proposer',
          voted_at: now.toISOString(),
        });

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
        const proposal = await getTeamScopedProposal(req.params.id);
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

    // GET /active — List active dynamic KPIs
    router.get('/active', async (_req: any, res: any) => {
      try {
        const active = await deps.store.listActive(deps.teamSlug);
        res.json({ active });
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
        const actor = requireActor(req);
        const { vote, reason, replaces } = req.body ?? {};
        if (!vote) {
          res.status(400).json({ error: 'Missing required field: vote' });
          return;
        }
        if (vote !== 'approve' && vote !== 'reject') {
          res.status(400).json({ error: 'vote must be "approve" or "reject"' });
          return;
        }

        const proposal = await getTeamScopedProposal(req.params.id);
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

        if (actor.type === 'operator' && typeof replaces === 'string' && replaces.trim() !== '') {
          await requireValidReplacement(replaces);
          await deps.store.setProposalReplacement(req.params.id, replaces);
          proposal.replaces_kpi_id = replaces;
        }
        if (actor.type === 'operator' && vote === 'approve') {
          const activeCount = await deps.store.countActive(deps.teamSlug);
          if (activeCount >= MAX_DYNAMIC_KPIS && !proposal.replaces_kpi_id) {
            res.status(409).json({
              error: `At capacity (${activeCount}/${MAX_DYNAMIC_KPIS}). Select a KPI to replace before approving.`,
            });
            return;
          }
        }
        const now = new Date().toISOString();

        // Record the vote
        await deps.store.castVote({
          proposal_id: req.params.id,
          voter_id: actor.id,
          voter_type: actor.type,
          vote,
          reason,
          voted_at: now,
        });
        deps.onVoteReceived?.({
          proposal_id: req.params.id,
          voter_id: actor.id,
          vote,
        });

        // Operator rejection is a terminal veto; team rejection requires majority quorum.
        if (actor.type === 'operator' && vote === 'reject') {
          await deps.store.transitionProposal(req.params.id, 'rejected', now);
          res.json({ proposal_id: req.params.id, status: 'rejected' });
          return;
        }

        // Check state transitions for approvals
        const newStatus = await evaluateApproval(deps, req.params.id, proposal, actor.type);
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
        requireActor(req, 'operator');
        const existing = await deps.store.getActive(deps.teamSlug, req.params.id);
        if (!existing) {
          res.status(404).json({ error: 'Active KPI not found' });
          return;
        }
        await deps.store.deactivate(deps.teamSlug, req.params.id);
        // Archive in catalog
        await deps.store.catalogTransition(deps.teamSlug, req.params.id, 'archived');
        deps.onDeactivated?.(req.params.id);
        res.json({ ok: true, deactivated: req.params.id });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal error';
        const status = err instanceof RouteError ? err.status : 500;
        res.status(status).json({ error: message });
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
  const { approve: agentApproves, reject: agentRejects } = await deps.store.countVotes(proposalId);
  const votes = await deps.store.listVotes(proposalId);
  const operatorApproval = votes.find((v) => v.voter_type === 'operator' && v.vote === 'approve');
  const operatorReject = votes.find((v) => v.voter_type === 'operator' && v.vote === 'reject');
  const quorum = Math.floor(deps.rosterSize / 2) + 1; // majority = >50%
  const agentQuorumMet = agentApproves >= quorum;
  const agentRejectQuorumMet = agentRejects >= quorum;

  const now = new Date().toISOString();

  if (operatorReject || agentRejectQuorumMet) {
    await deps.store.transitionProposal(proposalId, 'rejected', now);
    return 'rejected';
  }

  // Both gates met → activate
  if (agentQuorumMet && operatorApproval) {
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
      id: kpi.id.replace(/_/g, '-'),
      title: kpi.name,
      primitive: kpi.category === 'flow' || kpi.category === 'capacity' ? 'sparkline' : 'stat-card',
      data_source: `kpi.${kpi.category}.${kpi.id}`,
      derived_from: 'runtime-agent',
      config: { scope: kpi.scope, agent_id: kpi.agent_id, unit: kpi.unit, trend_window: proposal.proposal.pipeline.window },
      grid: { w: 3, h: 3 },
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

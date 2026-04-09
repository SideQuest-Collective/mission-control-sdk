import type { Pool } from 'pg';
import type {
  ActiveKpi,
  KpiProposalRecord,
  KpiProposalVote,
  KpiCatalogEntry,
} from './types.js';

// ── Store interface ─────────────────────────────────────────────────────

export interface KpiRuntimeStore {
  // ── Active KPIs ─────────────────────────────────────────
  listActive(teamSlug: string): Promise<ActiveKpi[]>;
  getActive(teamSlug: string, kpiId: string): Promise<ActiveKpi | null>;
  activate(entry: ActiveKpi): Promise<void>;
  deactivate(teamSlug: string, kpiId: string): Promise<void>;
  countActive(teamSlug: string): Promise<number>;

  // ── Proposals ───────────────────────────────────────────
  createProposal(record: KpiProposalRecord): Promise<void>;
  getProposal(proposalId: string): Promise<KpiProposalRecord | null>;
  listProposals(teamSlug: string, status?: string): Promise<KpiProposalRecord[]>;
  setProposalReplacement(proposalId: string, replacesKpiId: string): Promise<void>;
  transitionProposal(proposalId: string, status: string, resolvedAt?: string): Promise<void>;
  expireStaleProposals(): Promise<number>;

  // ── Votes ───────────────────────────────────────────────
  castVote(vote: KpiProposalVote): Promise<void>;
  listVotes(proposalId: string): Promise<KpiProposalVote[]>;
  countVotes(proposalId: string): Promise<{ approve: number; reject: number }>;

  // ── Catalog ─────────────────────────────────────────────
  catalogList(teamSlug: string, status?: string): Promise<KpiCatalogEntry[]>;
  catalogGet(teamSlug: string, kpiId: string): Promise<KpiCatalogEntry | null>;
  catalogUpsert(entry: KpiCatalogEntry): Promise<void>;
  catalogTransition(teamSlug: string, kpiId: string, status: string, replacedBy?: string): Promise<void>;
  catalogMarkReused(teamSlug: string, kpiIds: string[]): Promise<void>;
  catalogExportSnapshot(teamSlug: string): Promise<KpiCatalogEntry[]>;
}

// ── Bootstrap DDL ───────────────────────────────────────────────────────

export function quotePostgresIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function qualifiedTable(schema: string, table: string): string {
  return `${quotePostgresIdentifier(schema)}.${quotePostgresIdentifier(table)}`;
}

export function buildKpiBootstrapStatements(schema: string): string[] {
  const kpiActiveTable = qualifiedTable(schema, 'kpi_active');
  const kpiProposalsTable = qualifiedTable(schema, 'kpi_proposals');
  const kpiProposalVotesTable = qualifiedTable(schema, 'kpi_proposal_votes');
  const kpiCatalogTable = qualifiedTable(schema, 'kpi_catalog');

  return [
    // Active dynamic KPIs (max 10 per team)
    [
      `CREATE TABLE IF NOT EXISTS ${kpiActiveTable} (`,
      `  id TEXT NOT NULL,`,
      `  team_slug TEXT NOT NULL,`,
      `  kpi_definition JSONB NOT NULL,`,
      `  pipeline JSONB NOT NULL,`,
      `  widget_descriptor JSONB NOT NULL,`,
      `  origin TEXT NOT NULL,`,
      `  proposed_by TEXT,`,
      `  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),`,
      `  PRIMARY KEY (team_slug, id)`,
      `)`,
    ].join(' '),

    // KPI proposals and their approval state
    [
      `CREATE TABLE IF NOT EXISTS ${kpiProposalsTable} (`,
      `  id TEXT NOT NULL,`,
      `  team_slug TEXT NOT NULL,`,
      `  proposal JSONB NOT NULL,`,
      `  status TEXT NOT NULL DEFAULT 'pending',`,
      `  replaces_kpi_id TEXT,`,
      `  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),`,
      `  resolved_at TIMESTAMPTZ,`,
      `  expires_at TIMESTAMPTZ NOT NULL,`,
      `  PRIMARY KEY (id)`,
      `)`,
    ].join(' '),

    `CREATE INDEX IF NOT EXISTS idx_kpi_proposals_team_status ON ${kpiProposalsTable} (team_slug, status)`,

    // Individual votes on proposals
    [
      `CREATE TABLE IF NOT EXISTS ${kpiProposalVotesTable} (`,
      `  proposal_id TEXT NOT NULL REFERENCES ${kpiProposalsTable}(id),`,
      `  voter_id TEXT NOT NULL,`,
      `  voter_type TEXT NOT NULL,`,
      `  vote TEXT NOT NULL,`,
      `  reason TEXT,`,
      `  voted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),`,
      `  PRIMARY KEY (proposal_id, voter_id)`,
      `)`,
    ].join(' '),

    // Durable catalog (cross-bootstrap history)
    [
      `CREATE TABLE IF NOT EXISTS ${kpiCatalogTable} (`,
      `  id TEXT NOT NULL,`,
      `  team_slug TEXT NOT NULL,`,
      `  kpi_definition JSONB NOT NULL,`,
      `  pipeline JSONB NOT NULL,`,
      `  origin TEXT NOT NULL,`,
      `  proposed_by TEXT,`,
      `  first_registered TIMESTAMPTZ NOT NULL DEFAULT NOW(),`,
      `  last_active TIMESTAMPTZ NOT NULL DEFAULT NOW(),`,
      `  times_bootstrapped INTEGER NOT NULL DEFAULT 1,`,
      `  replaced_by TEXT,`,
      `  status TEXT NOT NULL DEFAULT 'active',`,
      `  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),`,
      `  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),`,
      `  PRIMARY KEY (team_slug, id)`,
      `)`,
    ].join(' '),

    `CREATE INDEX IF NOT EXISTS idx_kpi_catalog_team_status ON ${kpiCatalogTable} (team_slug, status)`,
  ];
}

// ── PostgreSQL implementation ───────────────────────────────────────────

export function createKpiRuntimeStore(pool: Pool, schema: string): KpiRuntimeStore {
  const kpiActiveTable = qualifiedTable(schema, 'kpi_active');
  const kpiProposalsTable = qualifiedTable(schema, 'kpi_proposals');
  const kpiProposalVotesTable = qualifiedTable(schema, 'kpi_proposal_votes');
  const kpiCatalogTable = qualifiedTable(schema, 'kpi_catalog');

  // ── Active KPIs ─────────────────────────────────────────

  const listActive = async (teamSlug: string): Promise<ActiveKpi[]> => {
    const result = await pool.query(
      `SELECT id, team_slug, kpi_definition, pipeline, widget_descriptor, origin, proposed_by, activated_at FROM ${kpiActiveTable} WHERE team_slug = $1 ORDER BY activated_at`,
      [teamSlug],
    );
    return result.rows.map(rowToActiveKpi);
  };

  const getActive = async (teamSlug: string, kpiId: string): Promise<ActiveKpi | null> => {
    const result = await pool.query(
      `SELECT id, team_slug, kpi_definition, pipeline, widget_descriptor, origin, proposed_by, activated_at FROM ${kpiActiveTable} WHERE team_slug = $1 AND id = $2 LIMIT 1`,
      [teamSlug, kpiId],
    );
    if ((result.rowCount ?? 0) < 1) return null;
    return rowToActiveKpi(result.rows[0]);
  };

  const activate = async (entry: ActiveKpi): Promise<void> => {
    await pool.query(
      [
        `INSERT INTO ${kpiActiveTable} (id, team_slug, kpi_definition, pipeline, widget_descriptor, origin, proposed_by, activated_at)`,
        `VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6, $7, $8)`,
        `ON CONFLICT (team_slug, id)`,
        `DO UPDATE SET kpi_definition = EXCLUDED.kpi_definition, pipeline = EXCLUDED.pipeline,`,
        `widget_descriptor = EXCLUDED.widget_descriptor, origin = EXCLUDED.origin,`,
        `proposed_by = EXCLUDED.proposed_by, activated_at = EXCLUDED.activated_at`,
      ].join(' '),
      [
        entry.id,
        entry.team_slug,
        JSON.stringify(entry.kpi_definition),
        JSON.stringify(entry.pipeline),
        JSON.stringify(entry.widget_descriptor),
        entry.origin,
        entry.proposed_by ?? null,
        entry.activated_at,
      ],
    );
  };

  const deactivate = async (teamSlug: string, kpiId: string): Promise<void> => {
    await pool.query(
      `DELETE FROM ${kpiActiveTable} WHERE team_slug = $1 AND id = $2`,
      [teamSlug, kpiId],
    );
  };

  const countActive = async (teamSlug: string): Promise<number> => {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM ${kpiActiveTable} WHERE team_slug = $1`,
      [teamSlug],
    );
    return result.rows[0]?.cnt ?? 0;
  };

  // ── Proposals ───────────────────────────────────────────

  const createProposal = async (record: KpiProposalRecord): Promise<void> => {
    await pool.query(
      [
        `INSERT INTO ${kpiProposalsTable} (id, team_slug, proposal, status, replaces_kpi_id, created_at, resolved_at, expires_at)`,
        `VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8)`,
      ].join(' '),
      [
        record.id,
        record.team_slug,
        JSON.stringify(record.proposal),
        record.status,
        record.replaces_kpi_id ?? null,
        record.created_at,
        record.resolved_at ?? null,
        record.expires_at,
      ],
    );
  };

  const getProposal = async (proposalId: string): Promise<KpiProposalRecord | null> => {
    const result = await pool.query(
      `SELECT id, team_slug, proposal, status, replaces_kpi_id, created_at, resolved_at, expires_at FROM ${kpiProposalsTable} WHERE id = $1 LIMIT 1`,
      [proposalId],
    );
    if ((result.rowCount ?? 0) < 1) return null;
    return rowToProposal(result.rows[0]);
  };

  const listProposals = async (teamSlug: string, status?: string): Promise<KpiProposalRecord[]> => {
    if (status) {
      const result = await pool.query(
        `SELECT id, team_slug, proposal, status, replaces_kpi_id, created_at, resolved_at, expires_at FROM ${kpiProposalsTable} WHERE team_slug = $1 AND status = $2 ORDER BY created_at DESC`,
        [teamSlug, status],
      );
      return result.rows.map(rowToProposal);
    }
    const result = await pool.query(
      `SELECT id, team_slug, proposal, status, replaces_kpi_id, created_at, resolved_at, expires_at FROM ${kpiProposalsTable} WHERE team_slug = $1 ORDER BY created_at DESC`,
      [teamSlug],
    );
    return result.rows.map(rowToProposal);
  };

  const setProposalReplacement = async (proposalId: string, replacesKpiId: string): Promise<void> => {
    await pool.query(
      `UPDATE ${kpiProposalsTable} SET replaces_kpi_id = $2 WHERE id = $1`,
      [proposalId, replacesKpiId],
    );
  };

  const transitionProposal = async (proposalId: string, status: string, resolvedAt?: string): Promise<void> => {
    if (resolvedAt) {
      await pool.query(
        `UPDATE ${kpiProposalsTable} SET status = $2, resolved_at = $3 WHERE id = $1`,
        [proposalId, status, resolvedAt],
      );
    } else {
      await pool.query(
        `UPDATE ${kpiProposalsTable} SET status = $2 WHERE id = $1`,
        [proposalId, status],
      );
    }
  };

  const expireStaleProposals = async (): Promise<number> => {
    const result = await pool.query(
      [
        `UPDATE ${kpiProposalsTable}`,
        `SET status = 'expired', resolved_at = NOW()`,
        `WHERE status IN ('pending', 'team_voted', 'operator_pending') AND expires_at < NOW()`,
        `RETURNING team_slug, proposal, created_at, resolved_at`,
      ].join(' '),
    );

    for (const row of result.rows) {
      const proposal = row.proposal as KpiProposalRecord['proposal'];
      const proposedAt = toISOString(row.created_at);
      const resolvedAt = toISOString(row.resolved_at);
      const proposedBy = proposal.proposed_by ?? proposal.kpi.agent_id;

      await pool.query(
        [
          `INSERT INTO ${kpiCatalogTable} (id, team_slug, kpi_definition, pipeline, origin, proposed_by, first_registered, last_active, times_bootstrapped, replaced_by, status, updated_at)`,
          `VALUES ($1, $2, $3::jsonb, $4::jsonb, 'runtime_agent', $5, $6, $7, 0, NULL, 'rejected', NOW())`,
          `ON CONFLICT (team_slug, id)`,
          `DO UPDATE SET`,
          `kpi_definition = EXCLUDED.kpi_definition,`,
          `pipeline = EXCLUDED.pipeline,`,
          `origin = EXCLUDED.origin,`,
          `proposed_by = EXCLUDED.proposed_by,`,
          `status = 'rejected',`,
          `updated_at = NOW()`,
        ].join(' '),
        [
          proposal.kpi.id,
          row.team_slug,
          JSON.stringify({
            id: proposal.kpi.id,
            name: proposal.kpi.name,
            category: proposal.kpi.category,
            unit: proposal.kpi.unit,
            description: proposal.kpi.description,
            data_source: proposal.pipeline.sources[0]?.family ?? 'unknown',
          }),
          JSON.stringify(proposal.pipeline),
          proposedBy ?? null,
          proposedAt,
          resolvedAt,
        ],
      );
    }

    return result.rowCount ?? 0;
  };

  // ── Votes ───────────────────────────────────────────────

  const castVote = async (vote: KpiProposalVote): Promise<void> => {
    await pool.query(
      [
        `INSERT INTO ${kpiProposalVotesTable} (proposal_id, voter_id, voter_type, vote, reason, voted_at)`,
        `VALUES ($1, $2, $3, $4, $5, $6)`,
        `ON CONFLICT (proposal_id, voter_id)`,
        `DO UPDATE SET vote = EXCLUDED.vote, reason = EXCLUDED.reason, voted_at = EXCLUDED.voted_at`,
      ].join(' '),
      [vote.proposal_id, vote.voter_id, vote.voter_type, vote.vote, vote.reason ?? null, vote.voted_at],
    );
  };

  const listVotes = async (proposalId: string): Promise<KpiProposalVote[]> => {
    const result = await pool.query(
      `SELECT proposal_id, voter_id, voter_type, vote, reason, voted_at FROM ${kpiProposalVotesTable} WHERE proposal_id = $1 ORDER BY voted_at`,
      [proposalId],
    );
    return result.rows.map(rowToVote);
  };

  const countVotes = async (proposalId: string): Promise<{ approve: number; reject: number }> => {
    const result = await pool.query(
      `SELECT vote, COUNT(*)::int AS cnt FROM ${kpiProposalVotesTable} WHERE proposal_id = $1 AND voter_type = 'agent' GROUP BY vote`,
      [proposalId],
    );
    let approve = 0;
    let reject = 0;
    for (const row of result.rows) {
      if (row.vote === 'approve') approve = row.cnt;
      if (row.vote === 'reject') reject = row.cnt;
    }
    return { approve, reject };
  };

  // ── Catalog ─────────────────────────────────────────────

  const catalogList = async (teamSlug: string, status?: string): Promise<KpiCatalogEntry[]> => {
    if (status) {
      const result = await pool.query(
        `SELECT id, team_slug, kpi_definition, pipeline, origin, proposed_by, first_registered, last_active, times_bootstrapped, replaced_by, status FROM ${kpiCatalogTable} WHERE team_slug = $1 AND status = $2 ORDER BY last_active DESC`,
        [teamSlug, status],
      );
      return result.rows.map(rowToCatalogEntry);
    }
    const result = await pool.query(
      `SELECT id, team_slug, kpi_definition, pipeline, origin, proposed_by, first_registered, last_active, times_bootstrapped, replaced_by, status FROM ${kpiCatalogTable} WHERE team_slug = $1 ORDER BY last_active DESC`,
      [teamSlug],
    );
    return result.rows.map(rowToCatalogEntry);
  };

  const catalogGet = async (teamSlug: string, kpiId: string): Promise<KpiCatalogEntry | null> => {
    const result = await pool.query(
      `SELECT id, team_slug, kpi_definition, pipeline, origin, proposed_by, first_registered, last_active, times_bootstrapped, replaced_by, status FROM ${kpiCatalogTable} WHERE team_slug = $1 AND id = $2 LIMIT 1`,
      [teamSlug, kpiId],
    );
    if ((result.rowCount ?? 0) < 1) return null;
    return rowToCatalogEntry(result.rows[0]);
  };

  const catalogUpsert = async (entry: KpiCatalogEntry): Promise<void> => {
    await pool.query(
      [
        `INSERT INTO ${kpiCatalogTable} (id, team_slug, kpi_definition, pipeline, origin, proposed_by, first_registered, last_active, times_bootstrapped, replaced_by, status, updated_at)`,
        `VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, NOW())`,
        `ON CONFLICT (team_slug, id)`,
        `DO UPDATE SET kpi_definition = EXCLUDED.kpi_definition, pipeline = EXCLUDED.pipeline,`,
        `origin = EXCLUDED.origin, proposed_by = EXCLUDED.proposed_by,`,
        `last_active = EXCLUDED.last_active, times_bootstrapped = EXCLUDED.times_bootstrapped,`,
        `replaced_by = EXCLUDED.replaced_by, status = EXCLUDED.status, updated_at = NOW()`,
      ].join(' '),
      [
        entry.id,
        entry.team_slug,
        JSON.stringify(entry.kpi_definition),
        JSON.stringify(entry.pipeline),
        entry.origin,
        entry.proposed_by ?? null,
        entry.first_registered,
        entry.last_active,
        entry.times_bootstrapped,
        entry.replaced_by ?? null,
        entry.status,
      ],
    );
  };

  const catalogTransition = async (teamSlug: string, kpiId: string, status: string, replacedBy?: string): Promise<void> => {
    if (replacedBy) {
      await pool.query(
        `UPDATE ${kpiCatalogTable} SET status = $3, replaced_by = $4, updated_at = NOW() WHERE team_slug = $1 AND id = $2`,
        [teamSlug, kpiId, status, replacedBy],
      );
    } else {
      await pool.query(
        `UPDATE ${kpiCatalogTable} SET status = $3, updated_at = NOW() WHERE team_slug = $1 AND id = $2`,
        [teamSlug, kpiId, status],
      );
    }
  };

  const catalogMarkReused = async (teamSlug: string, kpiIds: string[]): Promise<void> => {
    if (kpiIds.length === 0) return;
    // Use ANY($1::text[]) for safe parameterized IN
    await pool.query(
      `UPDATE ${kpiCatalogTable} SET times_bootstrapped = times_bootstrapped + 1, last_active = NOW(), updated_at = NOW() WHERE team_slug = $1 AND id = ANY($2::text[])`,
      [teamSlug, kpiIds],
    );
  };

  const catalogExportSnapshot = async (teamSlug: string): Promise<KpiCatalogEntry[]> => {
    const result = await pool.query(
      `SELECT id, team_slug, kpi_definition, pipeline, origin, proposed_by, first_registered, last_active, times_bootstrapped, replaced_by, status FROM ${kpiCatalogTable} WHERE team_slug = $1 ORDER BY last_active DESC`,
      [teamSlug],
    );
    return result.rows.map(rowToCatalogEntry);
  };

  return {
    listActive,
    getActive,
    activate,
    deactivate,
    countActive,
    createProposal,
    getProposal,
    listProposals,
    setProposalReplacement,
    transitionProposal,
    expireStaleProposals,
    castVote,
    listVotes,
    countVotes,
    catalogList,
    catalogGet,
    catalogUpsert,
    catalogTransition,
    catalogMarkReused,
    catalogExportSnapshot,
  };
}

// ── Row mappers ─────────────────────────────────────────────────────────

function rowToActiveKpi(row: any): ActiveKpi {
  return {
    id: row.id,
    team_slug: row.team_slug,
    kpi_definition: row.kpi_definition,
    pipeline: row.pipeline,
    widget_descriptor: row.widget_descriptor,
    origin: row.origin,
    proposed_by: row.proposed_by ?? undefined,
    activated_at: toISOString(row.activated_at),
  };
}

function rowToProposal(row: any): KpiProposalRecord {
  return {
    id: row.id,
    team_slug: row.team_slug,
    proposal: row.proposal,
    status: row.status,
    replaces_kpi_id: row.replaces_kpi_id ?? undefined,
    created_at: toISOString(row.created_at),
    resolved_at: row.resolved_at ? toISOString(row.resolved_at) : undefined,
    expires_at: toISOString(row.expires_at),
  };
}

function rowToVote(row: any): KpiProposalVote {
  return {
    proposal_id: row.proposal_id,
    voter_id: row.voter_id,
    voter_type: row.voter_type,
    vote: row.vote,
    reason: row.reason ?? undefined,
    voted_at: toISOString(row.voted_at),
  };
}

function rowToCatalogEntry(row: any): KpiCatalogEntry {
  return {
    id: row.id,
    team_slug: row.team_slug,
    kpi_definition: row.kpi_definition,
    pipeline: row.pipeline,
    origin: row.origin,
    proposed_by: row.proposed_by ?? undefined,
    first_registered: toISOString(row.first_registered),
    last_active: toISOString(row.last_active),
    times_bootstrapped: row.times_bootstrapped,
    replaced_by: row.replaced_by ?? undefined,
    status: row.status,
  };
}

function toISOString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return String(value);
}

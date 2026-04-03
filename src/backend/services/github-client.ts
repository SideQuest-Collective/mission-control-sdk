export interface GithubIssue {
  number: number;
  title: string;
  state: string;
  labels: string[];
  assignee: string | null;
  created_at: string;
  updated_at: string;
  url: string;
}

export interface GithubPR {
  number: number;
  title: string;
  state: string;
  author: string;
  created_at: string;
  url: string;
  draft: boolean;
}

export interface KanbanBoard {
  columns: { id: string; title: string; issues: GithubIssue[] }[];
}

const COLUMN_MAP: Record<string, { id: string; title: string }> = {
  'status:backlog': { id: 'backlog', title: 'Backlog' },
  'status:ready': { id: 'ready', title: 'Ready' },
  'status:in-progress': { id: 'in-progress', title: 'In Progress' },
  'status:in-review': { id: 'in-review', title: 'In Review' },
  'status:done': { id: 'done', title: 'Done' },
};

/**
 * Lightweight GitHub REST API client using fetch().
 * Gracefully returns empty results when token is missing.
 */
export class GitHubClient {
  private baseUrl = 'https://api.github.com';

  constructor(
    private token: string,
    private owner: string,
    private repo: string,
  ) {}

  private get headers(): Record<string, string> {
    const h: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (this.token) {
      h['Authorization'] = `Bearer ${this.token}`;
    }
    return h;
  }

  private get configured(): boolean {
    return Boolean(this.token && this.owner && this.repo);
  }

  async getIssues(filters?: {
    state?: string;
    labels?: string;
    assignee?: string;
  }): Promise<GithubIssue[]> {
    if (!this.configured) return [];

    const params = new URLSearchParams();
    params.set('per_page', '100');
    if (filters?.state) params.set('state', filters.state);
    if (filters?.labels) params.set('labels', filters.labels);
    if (filters?.assignee) params.set('assignee', filters.assignee);

    const res = await fetch(
      `${this.baseUrl}/repos/${this.owner}/${this.repo}/issues?${params}`,
      { headers: this.headers },
    );
    if (!res.ok) return [];

    const items: any[] = await res.json();
    // GitHub issues endpoint also returns PRs — filter them out
    return items
      .filter((i) => !i.pull_request)
      .map((i) => ({
        number: i.number,
        title: i.title,
        state: i.state,
        labels: (i.labels ?? []).map((l: any) => (typeof l === 'string' ? l : l.name)),
        assignee: i.assignee?.login ?? null,
        created_at: i.created_at,
        updated_at: i.updated_at,
        url: i.html_url,
      }));
  }

  async getPullRequests(state?: string): Promise<GithubPR[]> {
    if (!this.configured) return [];

    const params = new URLSearchParams();
    params.set('per_page', '100');
    params.set('state', state ?? 'open');

    const res = await fetch(
      `${this.baseUrl}/repos/${this.owner}/${this.repo}/pulls?${params}`,
      { headers: this.headers },
    );
    if (!res.ok) return [];

    const items: any[] = await res.json();
    return items.map((pr) => ({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      author: pr.user?.login ?? '',
      created_at: pr.created_at,
      url: pr.html_url,
      draft: pr.draft ?? false,
    }));
  }

  async getBoard(): Promise<KanbanBoard> {
    const issues = await this.getIssues({ state: 'all' });

    const columns: KanbanBoard['columns'] = [
      { id: 'backlog', title: 'Backlog', issues: [] },
      { id: 'ready', title: 'Ready', issues: [] },
      { id: 'in-progress', title: 'In Progress', issues: [] },
      { id: 'in-review', title: 'In Review', issues: [] },
      { id: 'done', title: 'Done', issues: [] },
    ];

    const columnIndex = new Map(columns.map((c, i) => [c.id, i]));

    for (const issue of issues) {
      // Closed issues go to Done
      if (issue.state === 'closed') {
        columns[columnIndex.get('done')!].issues.push(issue);
        continue;
      }

      // Find the first matching status label
      let placed = false;
      for (const label of issue.labels) {
        const col = COLUMN_MAP[label];
        if (col) {
          columns[columnIndex.get(col.id)!].issues.push(issue);
          placed = true;
          break;
        }
      }

      // No status label → Backlog
      if (!placed) {
        columns[columnIndex.get('backlog')!].issues.push(issue);
      }
    }

    return { columns };
  }

  async updateIssue(
    number: number,
    update: { labels?: string[]; assignees?: string[] },
  ): Promise<void> {
    if (!this.configured) return;

    const body: Record<string, unknown> = {};
    if (update.labels) body.labels = update.labels;
    if (update.assignees) body.assignees = update.assignees;

    const res = await fetch(
      `${this.baseUrl}/repos/${this.owner}/${this.repo}/issues/${number}`,
      {
        method: 'PATCH',
        headers: { ...this.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      throw new Error(`GitHub PATCH /issues/${number} failed: ${res.status} ${res.statusText}`);
    }
  }
}

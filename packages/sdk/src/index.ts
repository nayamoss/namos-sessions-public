import type {
  AgendaItem,
  ApiErrorResponse,
  ApiScope,
  CreateTokenResponse,
  Event,
  ListResponse,
  RevokeTokenResponse,
  Speaker,
  Submission,
  SubmissionStatus,
  Task,
  TokenSummary,
  UpdateSubmissionStatusResponse,
} from "./types.js";

export * from "./types.js";

export class NamosSessionsApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, response: ApiErrorResponse) {
    super(response.message);
    this.name = "NamosSessionsApiError";
    this.status = status;
    this.code = response.code;
    this.details = response.details;
  }
}

export interface NamosSessionsClientOptions {
  /** Convex Site URL, for example https://example.convex.site (without /api/v1). */
  baseUrl: string;
  /** A scoped API token, or an organizer Clerk session token for token-management routes. */
  token: string;
  /** Injectable transport for non-browser runtimes and tests. Defaults to global fetch. */
  fetch?: typeof fetch;
}

type RequestOptions = { method?: "GET" | "POST" | "DELETE"; body?: unknown; headers?: HeadersInit };

export class NamosSessionsClient {
  readonly events: { list: () => Promise<Event[]> };
  readonly submissions: {
    list: (eventId: string) => Promise<Submission[]>;
    updateStatus: (id: string, status: SubmissionStatus, options: { idempotencyKey: string }) => Promise<Submission>;
  };
  readonly speakers: { list: (eventId: string) => Promise<Speaker[]> };
  readonly agenda: { list: (eventId: string) => Promise<AgendaItem[]> };
  readonly tasks: { list: (eventId: string) => Promise<Task[]> };
  // Token management requires an organizer Clerk session token (via NamosSessionsClient's
  // `token`), never an API token — an API token can never mint, list, or revoke tokens,
  // itself included. Every token is scoped to exactly one event.
  readonly tokens: {
    create: (input: { eventId: string; label: string; scopes: ApiScope[] }) => Promise<CreateTokenResponse>;
    list: (eventId: string) => Promise<TokenSummary[]>;
    revoke: (eventId: string, id: string) => Promise<RevokeTokenResponse>;
  };

  private readonly baseUrl: string;
  private readonly token: string;
  private readonly transport: typeof fetch;

  constructor(options: NamosSessionsClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.token = options.token;
    this.transport = options.fetch ?? globalThis.fetch;
    if (!this.transport) throw new Error("A fetch implementation is required.");

    this.events = { list: async () => (await this.request<ListResponse<Event>>("/api/v1/events")).data };
    this.submissions = {
      list: async (eventId) => (await this.request<ListResponse<Submission>>("/api/v1/submissions", {}, { eventId })).data,
      updateStatus: async (id, status, options) => (await this.request<UpdateSubmissionStatusResponse>(`/api/v1/submissions/${encodeURIComponent(id)}/status`, {
        method: "POST", body: { status }, headers: { "Idempotency-Key": options.idempotencyKey },
      })).data,
    };
    this.speakers = { list: async (eventId) => (await this.request<ListResponse<Speaker>>("/api/v1/speakers", {}, { eventId })).data };
    this.agenda = { list: async (eventId) => (await this.request<ListResponse<AgendaItem>>("/api/v1/agenda", {}, { eventId })).data };
    this.tasks = { list: async (eventId) => (await this.request<ListResponse<Task>>("/api/v1/tasks", {}, { eventId })).data };
    this.tokens = {
      create: (input) => this.request<CreateTokenResponse>("/api/v1/tokens", { method: "POST", body: input }),
      list: async (eventId) => (await this.request<ListResponse<TokenSummary>>("/api/v1/tokens", {}, { eventId })).data,
      revoke: (eventId, id) => this.request<RevokeTokenResponse>(`/api/v1/tokens/${encodeURIComponent(id)}`, { method: "DELETE" }, { eventId }),
    };
  }

  private async request<T>(path: string, options: RequestOptions = {}, query?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
    const response = await this.transport(url, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.token}`,
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...options.headers,
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    if (response.ok) return response.json() as Promise<T>;

    let error: ApiErrorResponse;
    try { error = await response.json() as ApiErrorResponse; }
    catch { error = { code: "http_error", message: response.statusText || `Request failed with status ${response.status}.`, details: null }; }
    throw new NamosSessionsApiError(response.status, error);
  }
}

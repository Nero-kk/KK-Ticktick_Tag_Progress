import type {
  TaskFilter,
  TickTickProject,
  TickTickProjectData,
  TickTickTag,
  TickTickTask,
} from './contracts';
import { parseProjectData, parseProjects, parseTags, parseTask, parseTasks } from './contract-validator';
import { TickTickEndpointGuard } from './endpoint-guard';
import { kindForStatus, TickTickHttpError } from './errors';

const BASE_URL = 'https://api.ticktick.com/open/v1';

export interface ApiRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export interface ApiResponse {
  status: number;
  json: unknown;
}

export type ApiTransport = (request: ApiRequest) => Promise<ApiResponse>;
export type TokenProvider = () => string | null | Promise<string | null>;

interface ClientOptions {
  sleep: (milliseconds: number) => Promise<void>;
  random: () => number;
  timeoutMs: number;
}

const DEFAULT_OPTIONS: ClientOptions = {
  sleep: (milliseconds) => new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds)),
  random: Math.random,
  timeoutMs: 15_000,
};

export class OfficialOpenApiClient {
  private readonly guard = new TickTickEndpointGuard();

  constructor(
    private readonly tokenProvider: TokenProvider,
    private readonly transport: ApiTransport,
    options: Partial<ClientOptions> = {},
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  private readonly options: ClientOptions;

  private validate<T>(parser: (value: unknown) => T, value: unknown): T {
    try {
      return parser(value);
    } catch {
      throw new TickTickHttpError(200, 'contract', 'TickTick response contract changed');
    }
  }

  private async callWithTimeout(request: ApiRequest): Promise<ApiResponse> {
    return new Promise<ApiResponse>((resolve, reject) => {
      const timeout = globalThis.setTimeout(() => reject(new Error('timeout')), this.options.timeoutMs);
      void this.transport(request).then(
        (response) => { globalThis.clearTimeout(timeout); resolve(response); },
        (error: unknown) => { globalThis.clearTimeout(timeout); reject(error); },
      );
    });
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    this.guard.assertAllowed(method, path);
    const token = await this.tokenProvider();
    if (!token) throw new TickTickHttpError(401, 'auth', 'TickTick API token is not configured');

    const apiRequest: ApiRequest = {
      url: `${BASE_URL}${path}`,
      method: method.toUpperCase(),
      headers: {
        Authorization: ['Bearer', token].join(' '),
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    };
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let response: ApiResponse;
      try {
        response = await this.callWithTimeout(apiRequest);
      } catch {
        if (attempt < 2) {
          await this.options.sleep((2 ** attempt) * 1000 + this.options.random() * 250);
          continue;
        }
        throw new TickTickHttpError(0, 'network', 'TickTick network request failed');
      }
      if (response.status >= 200 && response.status < 300) return response.json as T;
      const retryable = response.status === 429 ? attempt < 3 : response.status >= 500 && attempt < 2;
      if (retryable) {
        await this.options.sleep((2 ** attempt) * 1000 + this.options.random() * 250);
        continue;
      }
      throw new TickTickHttpError(response.status, kindForStatus(response.status));
    }
    throw new TickTickHttpError(0, 'network', 'TickTick retry budget exhausted');
  }

  async getProjects(): Promise<TickTickProject[]> {
    return this.validate(parseProjects, await this.request('GET', '/project'));
  }

  async getTags(): Promise<TickTickTag[]> {
    return this.validate(parseTags, await this.request('GET', '/tag'));
  }

  async getProjectData(projectId: string): Promise<TickTickProjectData> {
    return this.validate(parseProjectData, await this.request('GET', `/project/${encodeURIComponent(projectId)}/data`));
  }

  async getTask(projectId: string, taskId: string): Promise<TickTickTask> {
    return this.validate(parseTask, await this.request('GET', `/project/${encodeURIComponent(projectId)}/task/${encodeURIComponent(taskId)}`));
  }

  async getCompletedTasks(filter: Pick<TaskFilter, 'projectIds' | 'startDate' | 'endDate'>): Promise<TickTickTask[]> {
    return this.validate(parseTasks, await this.request('POST', '/task/completed', filter));
  }

  async filterTasks(filter: TaskFilter): Promise<TickTickTask[]> {
    return this.validate(parseTasks, await this.request('POST', '/task/filter', filter));
  }

  async completeTask(projectId: string, taskId: string): Promise<void> {
    await this.request(
      'POST',
      `/project/${encodeURIComponent(projectId)}/task/${encodeURIComponent(taskId)}/complete`,
    );
  }
}

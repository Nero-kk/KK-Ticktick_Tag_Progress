var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key2 of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key2) && key2 !== except)
        __defProp(to, key2, { get: () => from[key2], enumerable: !(desc = __getOwnPropDesc(from, key2)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => TickTickTagProgressPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian5 = require("obsidian");

// src/api/contract-validator.ts
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function assertProject(value) {
  const item = record(value);
  if (!item || !nonEmptyString(item.id) || !nonEmptyString(item.name)) throw new Error("Invalid projects response");
}
function assertTask(value) {
  const item = record(value);
  const tagsValid = item?.tags === void 0 || Array.isArray(item.tags) && item.tags.every((tag) => typeof tag === "string");
  if (!item || !nonEmptyString(item.id) || !nonEmptyString(item.projectId) || !nonEmptyString(item.title) || typeof item.priority !== "number" || typeof item.status !== "number" || !tagsValid) {
    throw new Error("Invalid task response");
  }
}
function parseProjects(value) {
  if (!Array.isArray(value)) throw new Error("Invalid projects response");
  value.forEach(assertProject);
  return value;
}
function parseTags(value) {
  if (!Array.isArray(value)) throw new Error("Invalid tag response");
  for (const entry of value) {
    const item = record(entry);
    if (!item || !nonEmptyString(item.name)) throw new Error("Invalid tag response");
  }
  return value;
}
function parseTasks(value) {
  if (!Array.isArray(value)) throw new Error("Invalid task response");
  value.forEach(assertTask);
  return value;
}
function parseTask(value) {
  assertTask(value);
  return value;
}
function parseProjectData(value) {
  const item = record(value);
  if (!item || !Array.isArray(item.tasks) || !Array.isArray(item.columns)) throw new Error("Invalid project data response");
  assertProject(item.project);
  item.tasks.forEach(assertTask);
  return item;
}

// src/api/endpoint-guard.ts
var ALLOWED = [
  { method: "GET", path: /^\/project$/ },
  { method: "GET", path: /^\/tag$/ },
  { method: "GET", path: /^\/project\/[^/]+\/data$/ },
  { method: "GET", path: /^\/project\/[^/]+\/task\/[^/]+$/ },
  { method: "POST", path: /^\/task\/completed$/ },
  { method: "POST", path: /^\/task\/filter$/ },
  { method: "POST", path: /^\/project\/[^/]+\/task\/[^/]+\/complete$/ }
];
var TickTickEndpointGuard = class {
  assertAllowed(method, path) {
    const normalizedMethod = method.toUpperCase();
    const safePath = path.split("?")[0] ?? "";
    const allowed = ALLOWED.some((entry) => entry.method === normalizedMethod && entry.path.test(safePath));
    if (!allowed) {
      throw new Error(`TickTick endpoint guard rejected ${normalizedMethod} ${safePath}`);
    }
  }
};

// src/api/errors.ts
var TickTickHttpError = class extends Error {
  constructor(status, kind, message = `TickTick API request failed (${status})`) {
    super(message);
    this.status = status;
    this.kind = kind;
    this.name = "TickTickHttpError";
  }
};
function kindForStatus(status) {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate-limit";
  if (status >= 500) return "server";
  return "contract";
}

// src/api/official-open-api-client.ts
var BASE_URL = "https://api.ticktick.com/open/v1";
var DEFAULT_OPTIONS = {
  sleep: (milliseconds) => new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds)),
  random: Math.random,
  timeoutMs: 15e3
};
var OfficialOpenApiClient = class {
  constructor(tokenProvider, transport2, options = {}) {
    this.tokenProvider = tokenProvider;
    this.transport = transport2;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }
  guard = new TickTickEndpointGuard();
  options;
  validate(parser, value) {
    try {
      return parser(value);
    } catch {
      throw new TickTickHttpError(200, "contract", "TickTick response contract changed");
    }
  }
  async callWithTimeout(request) {
    return new Promise((resolve, reject) => {
      const timeout = globalThis.setTimeout(() => reject(new Error("timeout")), this.options.timeoutMs);
      void this.transport(request).then(
        (response) => {
          globalThis.clearTimeout(timeout);
          resolve(response);
        },
        (error) => {
          globalThis.clearTimeout(timeout);
          reject(error);
        }
      );
    });
  }
  async request(method, path, body) {
    this.guard.assertAllowed(method, path);
    const token = await this.tokenProvider();
    if (!token) throw new TickTickHttpError(401, "auth", "TickTick API token is not configured");
    const apiRequest = {
      url: `${BASE_URL}${path}`,
      method: method.toUpperCase(),
      headers: {
        Authorization: ["Bearer", token].join(" "),
        "Content-Type": "application/json"
      },
      ...body === void 0 ? {} : { body: JSON.stringify(body) }
    };
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let response;
      try {
        response = await this.callWithTimeout(apiRequest);
      } catch {
        if (attempt < 2) {
          await this.options.sleep(2 ** attempt * 1e3 + this.options.random() * 250);
          continue;
        }
        throw new TickTickHttpError(0, "network", "TickTick network request failed");
      }
      if (response.status >= 200 && response.status < 300) return response.json;
      const retryable = response.status === 429 ? attempt < 3 : response.status >= 500 && attempt < 2;
      if (retryable) {
        await this.options.sleep(2 ** attempt * 1e3 + this.options.random() * 250);
        continue;
      }
      throw new TickTickHttpError(response.status, kindForStatus(response.status));
    }
    throw new TickTickHttpError(0, "network", "TickTick retry budget exhausted");
  }
  async getProjects() {
    return this.validate(parseProjects, await this.request("GET", "/project"));
  }
  async getTags() {
    return this.validate(parseTags, await this.request("GET", "/tag"));
  }
  async getProjectData(projectId) {
    return this.validate(parseProjectData, await this.request("GET", `/project/${encodeURIComponent(projectId)}/data`));
  }
  async getTask(projectId, taskId) {
    return this.validate(parseTask, await this.request("GET", `/project/${encodeURIComponent(projectId)}/task/${encodeURIComponent(taskId)}`));
  }
  async getCompletedTasks(filter) {
    return this.validate(parseTasks, await this.request("POST", "/task/completed", filter));
  }
  async filterTasks(filter) {
    return this.validate(parseTasks, await this.request("POST", "/task/filter", filter));
  }
  async completeTask(projectId, taskId) {
    await this.request(
      "POST",
      `/project/${encodeURIComponent(projectId)}/task/${encodeURIComponent(taskId)}/complete`
    );
  }
};

// src/bases/projects-base-integrator.ts
var ROOT_FILTER_PATTERN = /^([ \t]*-[ \t]+)('?)type == "generated-cache"\2[ \t]*$/m;
var TASK_FILTER_PATTERN = /^[ \t]*-[ \t]+('?)type == "ticktick-task-note"\1[ \t]*$/m;
var TASK_FILTER_VALUE = 'type == "ticktick-task-note"';
var VIEW_NAME = "TickTick Task Notes";
var PROPERTY_ENTRIES = [
  ["ticktickProject", "TickTick \uD504\uB85C\uC81D\uD2B8"],
  ["ticktickTags", "TickTick \uD0DC\uADF8"],
  ["ticktickStatus", "TickTick \uC0C1\uD0DC"],
  ["ticktickDue", "\uB9C8\uAC10"],
  ["ticktickSnapshotAt", "Snapshot \uC2DC\uAC01"],
  ["ticktickCoverage", "\uC870\uD68C \uBC94\uC704"],
  ["ticktickSyncedAt", "\uB178\uD2B8 \uB3D9\uAE30\uD654"]
];
var TICKTICK_VIEW = `

  - type: table
    name: TickTick Task Notes
    filters:
      and:
        - 'type == "ticktick-task-note"'
    order:
      - file.name
      - ticktickProject
      - ticktickTags
      - ticktickStatus
      - ticktickDue
      - ticktickSnapshotAt
      - ticktickCoverage
      - ticktickSyncedAt
    groupBy:
      property: ticktickProject
      direction: ASC
`;
function addTickTickView(source) {
  const hasProperties = PROPERTY_ENTRIES.every(([key2]) => new RegExp(`^  ${key2}:`, "m").test(source));
  const hasTaskFilter = TASK_FILTER_PATTERN.test(source);
  if (source.includes(`name: ${VIEW_NAME}`) && hasTaskFilter && hasProperties) return source;
  const rootFilter = ROOT_FILTER_PATTERN.exec(source);
  if (!rootFilter) throw new Error("Projects.base root filter anchor not found");
  if (!/^views:\s*$/m.test(source)) throw new Error("Projects.base views anchor not found");
  if (!/^properties:\s*$/m.test(source)) throw new Error("Projects.base properties anchor not found");
  const prefix = rootFilter[1] ?? "    - ";
  const quote = rootFilter[2] ?? "";
  let patched = hasTaskFilter ? source : source.replace(ROOT_FILTER_PATTERN, `${rootFilter[0]}
${prefix}${quote}${TASK_FILTER_VALUE}${quote}`);
  for (const [key2, displayName] of PROPERTY_ENTRIES) {
    if (!new RegExp(`^  ${key2}:`, "m").test(patched)) {
      patched = patched.replace(/^views:\s*$/m, `  ${key2}:
    displayName: ${displayName}

views:`);
    }
  }
  if (patched.includes(`name: ${VIEW_NAME}`)) return patched;
  return patched.trimEnd() + TICKTICK_VIEW;
}

// src/core/period.ts
function assertMonth(month) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error(`Invalid month: ${month}`);
  const year = Number(match[1]);
  const monthIndex = Number(match[2]);
  if (monthIndex < 1 || monthIndex > 12) throw new Error(`Invalid month: ${month}`);
  return [year, monthIndex];
}
function daysInMonth(month) {
  const [year, monthIndex] = assertMonth(month);
  return new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
}
function getMonthRange(month) {
  return { startDate: `${month}-01`, endDate: `${month}-${String(daysInMonth(month)).padStart(2, "0")}` };
}
function shiftDate(date, deltaDays) {
  const time = Date.parse(`${date}T00:00:00Z`) + deltaDays * 864e5;
  return new Date(time).toISOString().slice(0, 10);
}
function getQueryRange(month) {
  const range = getMonthRange(month);
  return { startDate: shiftDate(range.startDate, -1), endDate: shiftDate(range.endDate, 1) };
}
function datePart(value) {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match?.[1] ?? null;
}
function dayNumber(value) {
  const date = datePart(value);
  if (!date) return null;
  const time = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(time) ? time : null;
}
function clampTaskToMonth(start, due, month) {
  const startTime = dayNumber(start);
  const dueTime = dayNumber(due);
  if (startTime === null || dueTime === null || startTime > dueTime) return null;
  const range = getMonthRange(month);
  const monthStart = dayNumber(range.startDate);
  const monthEnd = dayNumber(range.endDate);
  if (dueTime < monthStart || startTime > monthEnd) return null;
  const visibleStart = Math.max(startTime, monthStart);
  const visibleEnd = Math.min(dueTime, monthEnd);
  return {
    startDay: new Date(visibleStart).getUTCDate(),
    endDay: new Date(visibleEnd).getUTCDate(),
    clippedBeforeMonth: startTime < monthStart,
    clippedAfterMonth: dueTime > monthEnd
  };
}

// src/core/tag-progress-aggregator.ts
function normalizeTagKey(tag) {
  return tag.normalize("NFKC").toLocaleLowerCase("en-US");
}
function aggregateTagProgress(input, month, options = {}) {
  const uniqueTasks = /* @__PURE__ */ new Map();
  for (const task of input) if (!uniqueTasks.has(task.id)) uniqueTasks.set(task.id, task);
  const rows = /* @__PURE__ */ new Map();
  for (const task of uniqueTasks.values()) {
    if (task.status !== "open" && task.status !== "completed") continue;
    const rawTags = task.tags.length > 0 ? task.tags : options.showUntagged ? ["\uBBF8\uBD84\uB958"] : [];
    if (rawTags.length === 0) continue;
    const start = task.localStartDate ?? task.localDueDate;
    const due = task.localDueDate ?? task.localStartDate;
    const span = start && due ? clampTaskToMonth(start, due, month) : null;
    const unscheduled = !start && !due;
    if (!span && !unscheduled) continue;
    const seenTags = /* @__PURE__ */ new Set();
    for (const rawTag of rawTags) {
      const tagKey = normalizeTagKey(rawTag);
      if (seenTags.has(tagKey)) continue;
      seenTags.add(tagKey);
      const row = rows.get(tagKey) ?? {
        tagKey,
        displayName: rawTag.normalize("NFKC"),
        completed: 0,
        open: 0,
        total: 0,
        percent: 0,
        clippedBeforeMonth: false,
        clippedAfterMonth: false,
        hasUnscheduledTasks: false,
        unscheduledCount: 0,
        taskIds: [],
        taskIdSet: /* @__PURE__ */ new Set()
      };
      if (!row.taskIdSet.has(task.id)) {
        row.taskIdSet.add(task.id);
        row.taskIds.push(task.id);
        if (unscheduled) {
          row.hasUnscheduledTasks = true;
          row.unscheduledCount += 1;
        } else if (span) {
          row[task.status] += 1;
          row.total += 1;
          row.visibleStartDay = row.visibleStartDay === void 0 ? span.startDay : Math.min(row.visibleStartDay, span.startDay);
          row.visibleEndDay = row.visibleEndDay === void 0 ? span.endDay : Math.max(row.visibleEndDay, span.endDay);
          row.clippedBeforeMonth ||= span.clippedBeforeMonth;
          row.clippedAfterMonth ||= span.clippedAfterMonth;
        }
      }
      row.percent = row.total === 0 ? 0 : Math.round(row.completed / row.total * 1e3) / 10;
      rows.set(tagKey, row);
    }
  }
  return [...rows.values()].filter((row) => row.total > 0 || row.unscheduledCount > 0).sort((a, b) => a.tagKey.localeCompare(b.tagKey)).map(({ taskIdSet: _taskIdSet, ...row }) => row);
}

// src/core/local-date.ts
var DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})/;
function systemTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone });
    return true;
  } catch {
    return false;
  }
}
function formatInZone(instant, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(instant));
}
function toLocalDate(iso, timeZone, isAllDay, fallbackTimeZone) {
  const match = DATE_PREFIX.exec(iso);
  if (!match) return null;
  const datePart2 = match[1];
  if (isAllDay) return datePart2;
  const instant = Date.parse(iso);
  if (!Number.isFinite(instant)) return datePart2;
  const zone = timeZone && isValidTimeZone(timeZone) ? timeZone : fallbackTimeZone;
  return formatInZone(instant, zone);
}

// src/core/normalizer.ts
function requireString(value, field) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`Invalid task ${field}`);
  return value;
}
function normalizeStatus(status) {
  if (status === 0) return "open";
  if (status === 2) return "completed";
  if (status === -1) return "abandoned";
  return "unknown";
}
function normalizeTask(raw, projectName, fallbackTimeZone = systemTimeZone()) {
  const id = requireString(raw.id, "id");
  const projectId = requireString(raw.projectId, "projectId");
  const title = requireString(raw.title, "title");
  const body = typeof raw.content === "string" ? raw.content : typeof raw.desc === "string" ? raw.desc : void 0;
  const startAt = typeof raw.startDate === "string" ? raw.startDate : void 0;
  const dueAt = typeof raw.dueDate === "string" ? raw.dueDate : void 0;
  const timeZone = typeof raw.timeZone === "string" ? raw.timeZone : void 0;
  const isAllDay = raw.isAllDay === true;
  const localStartDate = startAt ? toLocalDate(startAt, timeZone, isAllDay, fallbackTimeZone) : null;
  const localDueDate = dueAt ? toLocalDate(dueAt, timeZone, isAllDay, fallbackTimeZone) : null;
  return {
    id,
    projectId,
    projectName: requireString(projectName, "projectName"),
    title,
    ...body === void 0 ? {} : { content: body },
    tags: Array.isArray(raw.tags) ? raw.tags.filter((tag) => typeof tag === "string" && tag.trim() !== "") : [],
    status: normalizeStatus(raw.status),
    ...startAt === void 0 ? {} : { startAt },
    ...dueAt === void 0 ? {} : { dueAt },
    ...typeof raw.completedTime === "string" ? { completedAt: raw.completedTime } : {},
    ...timeZone === void 0 ? {} : { timeZone },
    isAllDay,
    ...localStartDate ? { localStartDate } : {},
    ...localDueDate ? { localDueDate } : {}
  };
}

// src/core/snapshot-store.ts
function clone(value) {
  return structuredClone(value);
}
function record2(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function nonEmptyString2(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function optionalString(value) {
  return typeof value === "string" ? value : void 0;
}
function stringArray(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string") ? [...value] : null;
}
function sanitizeTask(value) {
  const item = record2(value);
  if (!item || !nonEmptyString2(item.id) || !nonEmptyString2(item.projectId) || !nonEmptyString2(item.projectName) || !nonEmptyString2(item.title)) return null;
  const tags = stringArray(item.tags);
  const statuses = ["open", "completed", "abandoned", "unknown"];
  if (!tags || typeof item.status !== "string" || !statuses.includes(item.status) || typeof item.isAllDay !== "boolean") return null;
  const startAt = optionalString(item.startAt);
  const dueAt = optionalString(item.dueAt);
  const timeZone = optionalString(item.timeZone);
  const fallbackTimeZone = systemTimeZone();
  const localStartDate = startAt ? toLocalDate(startAt, timeZone, item.isAllDay, fallbackTimeZone) : null;
  const localDueDate = dueAt ? toLocalDate(dueAt, timeZone, item.isAllDay, fallbackTimeZone) : null;
  return {
    id: item.id,
    projectId: item.projectId,
    projectName: item.projectName,
    title: item.title,
    tags,
    status: item.status,
    ...startAt === void 0 ? {} : { startAt },
    ...dueAt === void 0 ? {} : { dueAt },
    ...optionalString(item.completedAt) === void 0 ? {} : { completedAt: optionalString(item.completedAt) },
    ...timeZone === void 0 ? {} : { timeZone },
    isAllDay: item.isAllDay,
    ...localStartDate ? { localStartDate } : {},
    ...localDueDate ? { localDueDate } : {}
  };
}
function sanitizeCoverage(value, selectedMonth) {
  const item = record2(value);
  if (!item || item.status !== "complete" || item.selectedMonth !== selectedMonth) return null;
  const projectIds = stringArray(item.projectIds);
  const successfulCalls = stringArray(item.successfulCalls);
  if (!projectIds || !successfulCalls || !Array.isArray(item.failedCalls) || typeof item.openTaskCount !== "number" || !Number.isFinite(item.openTaskCount) || typeof item.completedTaskCount !== "number" || !Number.isFinite(item.completedTaskCount)) return null;
  const failedCalls = [];
  for (const failure of item.failedCalls) {
    const entry = record2(failure);
    if (!entry || !nonEmptyString2(entry.call) || typeof entry.reason !== "string") return null;
    failedCalls.push({ call: entry.call, reason: entry.reason });
  }
  return {
    status: "complete",
    selectedMonth,
    projectIds,
    successfulCalls,
    failedCalls,
    openTaskCount: item.openTaskCount,
    completedTaskCount: item.completedTaskCount
  };
}
function sanitizeSnapshot(value) {
  const item = record2(value);
  if (!item || item.schemaVersion !== 1 && item.schemaVersion !== 2 || !nonEmptyString2(item.selectedMonth) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(item.selectedMonth) || !nonEmptyString2(item.generatedAt) || !Array.isArray(item.tasks)) return null;
  const coverage = sanitizeCoverage(item.coverage, item.selectedMonth);
  if (!coverage) return null;
  const tasks = [];
  for (const task of item.tasks) {
    const sanitized = sanitizeTask(task);
    if (!sanitized) return null;
    tasks.push(sanitized);
  }
  return {
    schemaVersion: 2,
    selectedMonth: item.selectedMonth,
    generatedAt: item.generatedAt,
    coverage,
    tasks
  };
}
function sanitizeLastAttempt(value) {
  const item = record2(value);
  const results = ["success", "auth", "rate-limit", "server", "contract", "network"];
  if (!item || !nonEmptyString2(item.selectedMonth) || !nonEmptyString2(item.attemptedAt) || typeof item.result !== "string" || !results.includes(item.result)) return void 0;
  return {
    selectedMonth: item.selectedMonth,
    attemptedAt: item.attemptedAt,
    result: item.result,
    ...typeof item.reason === "string" ? { reason: item.reason } : {}
  };
}
function sanitizeState(value) {
  const item = record2(value);
  const source = record2(item?.snapshots);
  const snapshots = {};
  if (source) {
    for (const [month, candidate] of Object.entries(source)) {
      const snapshot = sanitizeSnapshot(candidate);
      if (snapshot?.selectedMonth === month) snapshots[month] = snapshot;
    }
  }
  const lastAttempt = sanitizeLastAttempt(item?.lastAttempt);
  return { snapshots, ...lastAttempt ? { lastAttempt } : {} };
}
var SnapshotStore = class {
  state;
  constructor(initial = { snapshots: {} }) {
    this.state = sanitizeState(initial);
  }
  accept(snapshot) {
    const sanitized = sanitizeSnapshot(snapshot);
    if (!sanitized || sanitized.coverage.status !== "complete") throw new Error("Only valid complete snapshots can replace last-good");
    this.state.snapshots[sanitized.selectedMonth] = sanitized;
    this.state.lastAttempt = { selectedMonth: sanitized.selectedMonth, attemptedAt: sanitized.generatedAt, result: "success" };
  }
  recordFailure(selectedMonth, result, reason) {
    this.state.lastAttempt = { selectedMonth, attemptedAt: (/* @__PURE__ */ new Date()).toISOString(), result, reason };
  }
  getLastGood(selectedMonth) {
    const snapshot = this.state.snapshots[selectedMonth];
    return snapshot ? clone(snapshot) : void 0;
  }
  getLastAttempt() {
    return this.state.lastAttempt ? clone(this.state.lastAttempt) : void 0;
  }
  exportState() {
    return clone(sanitizeState(this.state));
  }
};

// src/core/sync-service.ts
var SyncService = class {
  constructor(api, store) {
    this.api = api;
    this.store = store;
  }
  inFlight = null;
  sync(selectedMonth) {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.performSync(selectedMonth).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }
  async performSync(selectedMonth) {
    try {
      const [projects] = await Promise.all([this.api.getProjects(), this.api.getTags()]);
      const projectIds = projects.filter((project) => !project.closed).map((project) => project.id);
      const queryRange = getQueryRange(selectedMonth);
      const [projectData, filtered, completed] = await Promise.all([
        Promise.all(projectIds.map((id) => this.api.getProjectData(id))),
        this.api.filterTasks({ projectIds, ...queryRange, status: [0, 2] }),
        this.api.getCompletedTasks({ projectIds, ...queryRange })
      ]);
      const projectNames = new Map(projects.map((project) => [project.id, project.name]));
      const fallbackTimeZone = systemTimeZone();
      const inScope = (raw) => {
        const start = raw.startDate ?? raw.dueDate;
        const due = raw.dueDate ?? raw.startDate;
        if (!start && !due) return true;
        const isAllDay = raw.isAllDay === true;
        const localStart = start ? toLocalDate(start, raw.timeZone, isAllDay, fallbackTimeZone) : null;
        const localDue = due ? toLocalDate(due, raw.timeZone, isAllDay, fallbackTimeZone) : null;
        return Boolean(localStart && localDue && clampTaskToMonth(localStart, localDue, selectedMonth));
      };
      const rawById = /* @__PURE__ */ new Map();
      const allRaw = [...filtered, ...completed, ...projectData.flatMap((data) => data.tasks)];
      for (const raw of allRaw) {
        if (raw?.id && !rawById.has(raw.id) && inScope(raw)) rawById.set(raw.id, raw);
      }
      const tasks = [...rawById.values()].map((raw) => {
        const normalized = normalizeTask(raw, projectNames.get(raw.projectId) ?? raw.projectId, fallbackTimeZone);
        delete normalized.content;
        return normalized;
      });
      const generatedAt = (/* @__PURE__ */ new Date()).toISOString();
      const snapshot = {
        schemaVersion: 2,
        selectedMonth,
        generatedAt,
        coverage: {
          status: "complete",
          selectedMonth,
          projectIds,
          successfulCalls: ["project", "tag", ...projectIds.map((id) => `project/${id}/data`), "task/filter", "task/completed"],
          failedCalls: [],
          openTaskCount: tasks.filter((task) => task.status === "open").length,
          completedTaskCount: tasks.filter((task) => task.status === "completed").length
        },
        tasks
      };
      this.store.accept(snapshot);
      return snapshot;
    } catch (error) {
      const result = error instanceof TickTickHttpError ? error.kind : "network";
      this.store.recordFailure(selectedMonth, result, error instanceof Error ? error.message : "unknown");
      throw error;
    }
  }
};

// src/core/task-completion-service.ts
var CompletionRefreshError = class extends Error {
  constructor(cause) {
    super("TickTick accepted completion, but the local refresh failed", { cause });
    this.name = "CompletionRefreshError";
  }
};
var TaskCompletionService = class {
  constructor(api, synchronizer) {
    this.api = api;
    this.synchronizer = synchronizer;
  }
  inFlight = /* @__PURE__ */ new Map();
  completeAndRefresh(month, task) {
    if (task.status !== "open") return Promise.resolve();
    const key2 = `${task.projectId}:${task.id}`;
    const existing = this.inFlight.get(key2);
    if (existing) return existing;
    const operation = this.run(month, task).finally(() => {
      if (this.inFlight.get(key2) === operation) this.inFlight.delete(key2);
    });
    this.inFlight.set(key2, operation);
    return operation;
  }
  async run(month, task) {
    await this.api.completeTask(task.projectId, task.id);
    try {
      await this.synchronizer.sync(month);
    } catch (error) {
      throw new CompletionRefreshError(error);
    }
  }
};

// src/notes/obsidian-task-note-port.ts
var import_obsidian = require("obsidian");

// src/notes/task-note-format.ts
var START_MARKER = "<!-- ticktick-managed:start -->";
var END_MARKER = "<!-- ticktick-managed:end -->";
var LEGACY_NOTICE = "> \uC774 \uB178\uD2B8\uB294 TickTick \uD0DC\uC2A4\uD06C\uC758 \uC77D\uAE30 \uC804\uC6A9 \uBBF8\uB7EC\uC785\uB2C8\uB2E4. \uC0C1\uD0DC \uBCC0\uACBD\uC740 TickTick\uC5D0\uC11C \uD558\uC138\uC694.";
var COMPLETION_NOTICE = "> \uC774 \uB178\uD2B8\uB294 TickTick \uB0B4\uC6A9\uC744 \uB85C\uCEEC\uB85C \uBBF8\uB7EC\uB9C1\uD569\uB2C8\uB2E4. \uC644\uB8CC \uCC98\uB9AC\uB294 TickTick \uD0DC\uADF8 \uC9C4\uD589\uB960 \uB300\uC2DC\uBCF4\uB4DC\uC758 \uCCB4\uD06C \uBC84\uD2BC\uC5D0\uC11C \uD655\uC778 \uD6C4 \uC218\uD589\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.";
function yamlString(value) {
  return JSON.stringify(value);
}
function sanitizeFileName(title, maxLength = 72) {
  const cleaned = title.replace(/[\\/:*?"<>|#^[\]]/g, "-").replace(/\s+/g, " ").trim();
  return (cleaned || "\uC81C\uBAA9 \uC5C6\uC74C").slice(0, maxLength).trim();
}
function taskNoteFileName(task) {
  return `${sanitizeFileName(task.title)}--${task.id.slice(-8)}.md`;
}
function buildTaskNote(task, meta) {
  const tagLines = task.tags.length > 0 ? task.tags.map((tag) => `  - ${yamlString(tag)}`).join("\n") : "  []";
  return `---
type: ticktick-task-note
title: ${yamlString(task.title)}
aliases:
  - ${yamlString(task.title)}
description: ${yamlString("TickTick \uD0DC\uC2A4\uD06C\uC640 \uC5F0\uACB0\uB41C \uB85C\uCEEC \uC791\uC5C5 \uBA54\uBAA8")}
created: ${meta.syncedAt.slice(0, 10)}
updated: ${meta.syncedAt.slice(0, 10)}
tags:
  - ticktick-note
ticktickId: ${yamlString(task.id)}
ticktickProjectId: ${yamlString(task.projectId)}
ticktickProject: ${yamlString(task.projectName)}
ticktickTags:
${tagLines}
ticktickStatus: ${task.status}
ticktickStart: ${task.startAt ? yamlString(task.startAt) : ""}
ticktickDue: ${task.dueAt ? yamlString(task.dueAt) : ""}
ticktickCompletedAt: ${task.completedAt ? yamlString(task.completedAt) : ""}
ticktickSyncedAt: ${yamlString(meta.syncedAt)}
ticktickSnapshotAt: ${yamlString(meta.snapshotAt ?? meta.syncedAt)}
ticktickCoverage: ${meta.coverage}
syncMode: completion-write-through
---

# ${task.title}

> [!info] TickTick \uC5F0\uACB0
${COMPLETION_NOTICE}

${START_MARKER}
## TickTick \uB0B4\uC6A9

${task.content?.trim() || "\uB0B4\uC6A9 \uC5C6\uC74C"}
${END_MARKER}

## \uC791\uC5C5 \uBA54\uBAA8
`;
}
function updateManagedBlock(source, content) {
  const starts = source.split(START_MARKER).length - 1;
  const ends = source.split(END_MARKER).length - 1;
  if (starts !== 1 || ends !== 1) throw new Error("Managed marker conflict");
  const startIndex = source.indexOf(START_MARKER);
  const endIndex = source.indexOf(END_MARKER);
  if (endIndex < startIndex) throw new Error("Managed marker order conflict");
  const replacement = `${START_MARKER}
## TickTick \uB0B4\uC6A9

${content.trim() || "\uB0B4\uC6A9 \uC5C6\uC74C"}
${END_MARKER}`;
  const updated = source.slice(0, startIndex) + replacement + source.slice(endIndex + END_MARKER.length);
  return updated.replace(LEGACY_NOTICE, COMPLETION_NOTICE);
}
function setOptional(frontmatter, key2, value) {
  if (value === void 0) delete frontmatter[key2];
  else frontmatter[key2] = value;
}
function updateManagedFrontmatter(frontmatter, task, meta) {
  const aliases2 = Array.isArray(frontmatter.aliases) ? frontmatter.aliases.filter((alias) => typeof alias === "string") : [];
  if (!aliases2.includes(task.title)) aliases2.push(task.title);
  frontmatter.title = task.title;
  frontmatter.aliases = aliases2;
  frontmatter.updated = meta.syncedAt.slice(0, 10);
  frontmatter.ticktickId = task.id;
  frontmatter.ticktickProjectId = task.projectId;
  frontmatter.ticktickProject = task.projectName;
  frontmatter.ticktickTags = [...task.tags];
  frontmatter.ticktickStatus = task.status;
  setOptional(frontmatter, "ticktickStart", task.startAt);
  setOptional(frontmatter, "ticktickDue", task.dueAt);
  setOptional(frontmatter, "ticktickCompletedAt", task.completedAt);
  frontmatter.ticktickSyncedAt = meta.syncedAt;
  frontmatter.ticktickSnapshotAt = meta.snapshotAt ?? meta.syncedAt;
  frontmatter.ticktickCoverage = meta.coverage;
  frontmatter.syncMode = "completion-write-through";
}

// src/notes/obsidian-task-note-port.ts
var ObsidianTaskNotePort = class {
  constructor(app) {
    this.app = app;
  }
  async listTaskNotes() {
    const notes = [];
    const candidates = this.app.vault.getMarkdownFiles().filter((file) => file.path.includes("/TickTick Notes/"));
    for (const file of candidates) {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (frontmatter?.type === "ticktick-task-note" && typeof frontmatter.ticktickId === "string") {
        notes.push({ path: file.path, ticktickId: frontmatter.ticktickId });
        continue;
      }
      const info = (0, import_obsidian.getFrontMatterInfo)(await this.app.vault.read(file));
      if (!info.exists) continue;
      try {
        const parsed = (0, import_obsidian.parseYaml)(info.frontmatter);
        if (parsed?.type === "ticktick-task-note" && typeof parsed.ticktickId === "string") {
          notes.push({ path: file.path, ticktickId: parsed.ticktickId });
        }
      } catch {
      }
    }
    return notes;
  }
  async listProjectFolders() {
    const projects = this.app.vault.getFolderByPath("40. Projects");
    if (!projects) return [];
    return projects.children.filter((child) => child instanceof import_obsidian.TFolder).map((folder) => folder.name);
  }
  async ensureFolder(path) {
    const normalized = (0, import_obsidian.normalizePath)(path);
    if (!this.app.vault.getFolderByPath(normalized)) await this.app.vault.createFolder(normalized);
  }
  async create(path, content) {
    const normalized = (0, import_obsidian.normalizePath)(path);
    if (this.app.vault.getAbstractFileByPath(normalized)) throw new Error(`Task note path already exists: ${normalized}`);
    return (await this.app.vault.create(normalized, content)).path;
  }
  async update(path, task, meta) {
    const file = this.app.vault.getFileByPath((0, import_obsidian.normalizePath)(path));
    if (!(file instanceof import_obsidian.TFile)) throw new Error(`Task note not found: ${path}`);
    updateManagedBlock(await this.app.vault.read(file), task.content ?? "");
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      updateManagedFrontmatter(frontmatter, task, meta);
    });
    await this.app.vault.process(file, (source) => updateManagedBlock(source, task.content ?? ""));
  }
  async open(path, newPane) {
    const file = this.app.vault.getFileByPath((0, import_obsidian.normalizePath)(path));
    if (!(file instanceof import_obsidian.TFile)) throw new Error(`Task note not found: ${path}`);
    await this.app.workspace.getLeaf(newPane ? "tab" : false).openFile(file);
  }
};

// src/notes/project-mapper.ts
function key(value) {
  return value.normalize("NFKC").trim().toUpperCase();
}
function equivalentKeys(value) {
  const normalized = key(value);
  const candidates = /* @__PURE__ */ new Set([normalized]);
  const uni = /^UNI(.+)$/.exec(normalized);
  if (uni?.[1]) {
    candidates.add(`U${uni[1]}`);
    candidates.add(uni[1]);
  }
  const shortU = /^U(.+)$/.exec(normalized);
  if (shortU?.[1]) {
    candidates.add(`UNI${shortU[1]}`);
    candidates.add(shortU[1]);
  }
  if (!normalized.startsWith("U")) {
    candidates.add(`U${normalized}`);
    candidates.add(`UNI${normalized}`);
  }
  if (normalized === "UNIOS8K" || normalized === "UOS8K" || normalized === "OS8K") {
    candidates.add("UNIOS8K");
    candidates.add("UOS8K");
    candidates.add("OS8K");
  }
  return candidates;
}
function resolveCanonicalProject(projectName, canonicalFolders, explicitAliases) {
  const folders = new Map(canonicalFolders.map((folder) => [key(folder), folder]));
  const direct = folders.get(key(projectName));
  if (direct) return direct;
  const aliasTarget = Object.entries(explicitAliases).find(([alias]) => key(alias) === key(projectName))?.[1];
  if (aliasTarget) return folders.get(key(aliasTarget)) ?? null;
  const inputKeys = equivalentKeys(projectName);
  const matches = canonicalFolders.filter((folder) => {
    const folderKeys = equivalentKeys(folder);
    return [...inputKeys].some((candidate) => folderKeys.has(candidate));
  });
  return matches.length === 1 ? matches[0] ?? null : null;
}

// src/notes/task-note-repository.ts
function resolveTaskProject(task, folders, aliases2) {
  const direct = resolveCanonicalProject(task.projectName, folders, aliases2);
  if (direct) return direct;
  const tagMatches = new Set(task.tags.map((tag) => resolveCanonicalProject(tag, folders, aliases2)).filter((project) => project !== null));
  if (tagMatches.size > 1) {
    throw new Error(`Ambiguous project tags: ${[...tagMatches].join(", ")}`);
  }
  return tagMatches.values().next().value ?? null;
}
var TaskNoteRepository = class {
  constructor(port, projectAliases) {
    this.port = port;
    this.projectAliases = projectAliases;
  }
  inFlight = /* @__PURE__ */ new Map();
  async openOrCreate(task, meta, newPane) {
    let operation = this.inFlight.get(task.id);
    if (!operation) {
      operation = this.upsert(task, meta);
      this.inFlight.set(task.id, operation);
    }
    try {
      const path = await operation;
      await this.port.open(path, newPane);
      return path;
    } finally {
      if (this.inFlight.get(task.id) === operation) this.inFlight.delete(task.id);
    }
  }
  async upsert(task, meta) {
    const matches = (await this.port.listTaskNotes()).filter((note) => note.ticktickId === task.id);
    if (matches.length > 1) throw new Error(`Duplicate TickTick ID: ${task.id}`);
    if (matches[0]) {
      await this.port.update(matches[0].path, task, meta);
      return matches[0].path;
    }
    const folders = await this.port.listProjectFolders();
    const canonicalProject = resolveTaskProject(task, folders, this.projectAliases);
    if (!canonicalProject) {
      throw new Error(`Project mapping not found: ${task.projectName}; tags: ${task.tags.join(", ") || "(none)"}`);
    }
    const folder = `40. Projects/${canonicalProject}/TickTick Notes`;
    await this.port.ensureFolder(folder);
    const path = `${folder}/${taskNoteFileName(task)}`;
    try {
      return await this.port.create(path, buildTaskNote(task, meta));
    } catch (error) {
      const recovered = (await this.port.listTaskNotes()).filter((note) => note.ticktickId === task.id);
      if (recovered.length > 1) throw new Error(`Duplicate TickTick ID: ${task.id}`);
      if (!recovered[0]) throw error;
      await this.port.update(recovered[0].path, task, meta);
      return recovered[0].path;
    }
  }
};

// src/settings-model.ts
var DEFAULT_SETTINGS = {
  secretName: "ticktick-progress-api-token",
  includeTags: [],
  excludeTags: [],
  showUntagged: true,
  projectAliases: {},
  projectsBasePath: "90. Settings/Bases/Projects.base"
};
function validSecretId(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}
function storeTickTickAccessToken(storage, raw) {
  const token = raw.trim().replace(/^Bearer\s+/i, "").trim();
  if (!token || token.includes("@") || /\s/.test(token)) {
    throw new Error("Paste a TickTick API token, not account credentials");
  }
  storage.setSecret(DEFAULT_SETTINGS.secretName, token);
  return DEFAULT_SETTINGS.secretName;
}
function stringArray2(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean);
}
function aliases(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry) => typeof entry[1] === "string").map(([key2, target]) => [key2.trim(), target.trim()]).filter(([key2, target]) => Boolean(key2 && target)));
}
function loadSettings(raw) {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const secretName = typeof value.secretName === "string" ? value.secretName.trim() : "";
  return {
    secretName: validSecretId(secretName) ? secretName : DEFAULT_SETTINGS.secretName,
    includeTags: stringArray2(value.includeTags),
    excludeTags: stringArray2(value.excludeTags),
    showUntagged: Object.prototype.hasOwnProperty.call(value, "showUntagged") ? value.showUntagged === true : DEFAULT_SETTINGS.showUntagged,
    projectAliases: aliases(value.projectAliases),
    projectsBasePath: typeof value.projectsBasePath === "string" && value.projectsBasePath.trim() ? value.projectsBasePath.trim() : DEFAULT_SETTINGS.projectsBasePath
  };
}

// src/settings.ts
var import_obsidian2 = require("obsidian");
function csv(value) {
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}
var TickTickTagProgressSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(plugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "TickTick \uD0DC\uADF8 \uC9C4\uD589\uB960" });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "\uACF5\uC2DD Open API v1\uC744 \uC77D\uAE30 \uC804\uC6A9\uC73C\uB85C \uC0AC\uC6A9\uD569\uB2C8\uB2E4. \uD1A0\uD070 \uAC12\uC740 SecretStorage\uC5D0\uB9CC \uBCF4\uAD00\uB429\uB2C8\uB2E4."
    });
    const hasToken = Boolean(this.app.secretStorage.getSecret(this.plugin.settings.secretName));
    let pendingToken = "";
    new import_obsidian2.Setting(containerEl).setName("TickTick API \uD1A0\uD070 \uC9C1\uC811 \uC800\uC7A5").setDesc("TickTick \uC6F9 \u2192 \uC124\uC815 \u2192 \uACC4\uC815 \u2192 API Token\uC5D0\uC11C \uB9CC\uB4E0 \uD1A0\uD070\uB9CC \uBD99\uC5EC\uB123\uC73C\uC138\uC694. \uB85C\uADF8\uC778 \uC774\uBA54\uC77C\uACFC \uBE44\uBC00\uBC88\uD638\uB294 \uC785\uB825\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uD1A0\uD070 \uAC12\uC740 Obsidian SecretStorage\uC5D0 \uC800\uC7A5\uB429\uB2C8\uB2E4.").addText((text) => {
      text.setPlaceholder(hasToken ? "\uC800\uC7A5\uB41C \uD1A0\uD070\uC744 \uBCC0\uACBD\uD558\uB824\uBA74 \uC0C8 \uD1A0\uD070 \uBD99\uC5EC\uB123\uAE30" : "API \uD1A0\uD070 \uBD99\uC5EC\uB123\uAE30").onChange((value) => {
        pendingToken = value;
      });
      text.inputEl.type = "password";
      text.inputEl.autocomplete = "off";
    }).addButton((button2) => button2.setButtonText("\uD1A0\uD070 \uC800\uC7A5").setCta().onClick(async () => {
      try {
        this.plugin.settings.secretName = storeTickTickAccessToken(this.app.secretStorage, pendingToken);
        await this.plugin.savePluginData();
        new import_obsidian2.Notice("TickTick API \uD1A0\uD070\uC744 SecretStorage\uC5D0 \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.");
        this.display();
      } catch {
        new import_obsidian2.Notice("TickTick \uB85C\uADF8\uC778 \uC774\uBA54\uC77C\uC774\uB098 \uBE44\uBC00\uBC88\uD638\uAC00 \uC544\uB2C8\uB77C API Token \uAC12\uC744 \uBD99\uC5EC\uB123\uC73C\uC138\uC694.", 8e3);
      }
    }));
    new import_obsidian2.Setting(containerEl).setName("\uD1A0\uD070 \uC800\uC7A5 \uC0C1\uD0DC").setDesc(hasToken ? `\uC800\uC7A5\uB428 \xB7 SecretStorage ID: ${this.plugin.settings.secretName}` : "\uBBF8\uC124\uC815 \xB7 TickTick \uACC4\uC815\uC758 API Token\uC744 \uBC1C\uAE09\uBC1B\uC544 \uC704 \uC785\uB825\uB780\uC5D0 \uC800\uC7A5\uD558\uC138\uC694.");
    new import_obsidian2.Setting(containerEl).setName("\uC5F0\uACB0 \uD655\uC778").setDesc("\uD1A0\uD070\uC744 \uB85C\uADF8\uC5D0 \uB0A8\uAE30\uC9C0 \uC54A\uACE0 \uD504\uB85C\uC81D\uD2B8 \uBAA9\uB85D \uC77D\uAE30\uB9CC \uC2DC\uD5D8\uD569\uB2C8\uB2E4.").addButton((button2) => button2.setButtonText("\uACF5\uC2DD API \uD655\uC778").onClick(async () => this.plugin.testConnection()));
    new import_obsidian2.Setting(containerEl).setName("\uD3EC\uD568 \uD0DC\uADF8").setDesc("\uC27C\uD45C\uB85C \uAD6C\uBD84\uD569\uB2C8\uB2E4. \uBE44\uC6CC \uB450\uBA74 \uBAA8\uB4E0 \uD0DC\uADF8\uB97C \uD45C\uC2DC\uD569\uB2C8\uB2E4.").addText((text) => text.setPlaceholder("UNIOS8K, UNI610H").setValue(this.plugin.settings.includeTags.join(", ")).onChange(async (value) => {
      this.plugin.settings.includeTags = csv(value);
      await this.plugin.savePluginData();
      this.plugin.refreshViews();
    }));
    new import_obsidian2.Setting(containerEl).setName("\uC81C\uC678 \uD0DC\uADF8").setDesc("\uD3EC\uD568 \uBAA9\uB85D\uBCF4\uB2E4 \uC6B0\uC120\uD569\uB2C8\uB2E4.").addText((text) => text.setValue(this.plugin.settings.excludeTags.join(", ")).onChange(async (value) => {
      this.plugin.settings.excludeTags = csv(value);
      await this.plugin.savePluginData();
      this.plugin.refreshViews();
    }));
    new import_obsidian2.Setting(containerEl).setName("\uBBF8\uBD84\uB958 \uD45C\uC2DC").setDesc("\uD0DC\uADF8 \uC5C6\uB294 \uD0DC\uC2A4\uD06C\uB97C \uBBF8\uBD84\uB958 \uD589\uC73C\uB85C \uBAA8\uC74D\uB2C8\uB2E4.").addToggle((toggle) => toggle.setValue(this.plugin.settings.showUntagged).onChange(async (value) => {
      this.plugin.settings.showUntagged = value;
      await this.plugin.savePluginData();
      this.plugin.refreshViews();
    }));
    new import_obsidian2.Setting(containerEl).setName("Projects.base \uACBD\uB85C").setDesc("\uC0DD\uC131\uB41C \uB85C\uCEEC \uB178\uD2B8\uB97C \uC5EC\uB294 \uAE30\uC874 Base\uC785\uB2C8\uB2E4. \uC0C8 Base\uB294 \uB9CC\uB4E4\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.").addText((text) => text.setValue(this.plugin.settings.projectsBasePath).onChange(async (value) => {
      this.plugin.settings.projectsBasePath = value.trim();
      await this.plugin.savePluginData();
    }));
    new import_obsidian2.Setting(containerEl).setName("Bases \uBDF0 \uC5F0\uACB0").setDesc("\uAE30\uC874 Projects.base\uC5D0 TickTick Task Notes \uBDF0\uAC00 \uC5C6\uC744 \uB54C\uB9CC \uC548\uC804\uD558\uAC8C \uCD94\uAC00\uD569\uB2C8\uB2E4.").addButton((button2) => button2.setButtonText("\uC5F0\uACB0 \uD655\uC778/\uCD94\uAC00").onClick(async () => this.plugin.ensureProjectsBase()));
  }
};

// src/ui/dashboard-view.ts
var import_obsidian3 = require("obsidian");

// src/ui/dashboard-renderer.ts
function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== void 0) el.textContent = text;
  return el;
}
function button(text, label = text) {
  const el = element("button", "ttgp-button", text);
  el.type = "button";
  el.setAttribute("aria-label", label);
  return el;
}
function formatMonth(month) {
  const [year, monthNumber] = month.split("-");
  return `${year}\uB144 ${Number(monthNumber)}\uC6D4`;
}
function renderToolbar(root, model, actions) {
  const toolbar = element("header", "ttgp-toolbar");
  const monthNav = element("div", "ttgp-month-nav");
  const prev = button("\u2039", "\uC774\uC804 \uB2EC");
  prev.addEventListener("click", () => actions.onMonthChange(-1));
  const month = element("strong", "ttgp-month-title", formatMonth(model.month));
  const next = button("\u203A", "\uB2E4\uC74C \uB2EC");
  next.addEventListener("click", () => actions.onMonthChange(1));
  monthNav.append(prev, month, next);
  const meta = element("div", "ttgp-toolbar-meta");
  const status = element("span", `ttgp-status ttgp-status--${model.status}`, model.status === "complete" ? "\uC804\uCCB4 \uC870\uD68C" : model.status);
  const count = element("span", "ttgp-count", `\uC77C\uC815 \uD0DC\uC2A4\uD06C ${model.uniqueTaskCount}`);
  const synced = element("span", "ttgp-last-sync", model.lastSuccessAt ? `\uB9C8\uC9C0\uB9C9 \uC131\uACF5 ${new Date(model.lastSuccessAt).toLocaleString("ko-KR")}` : "\uB3D9\uAE30\uD654 \uAE30\uB85D \uC5C6\uC74C");
  meta.append(status, count, synced);
  const sync = button(model.status === "syncing" ? "\uB3D9\uAE30\uD654 \uC911\u2026" : "\uB3D9\uAE30\uD654", "TickTick \uC218\uB3D9 \uB3D9\uAE30\uD654");
  sync.classList.add("ttgp-button--sync");
  sync.disabled = model.status === "syncing";
  sync.addEventListener("click", actions.onSync);
  toolbar.append(monthNav, meta, sync);
  root.append(toolbar);
}
function renderHeader(root, month) {
  const header = element("div", "ttgp-grid-header");
  const tag = element("div", "ttgp-heading ttgp-heading--tag", "\uD0DC\uADF8");
  tag.dataset.column = "tag";
  const progress = element("div", "ttgp-heading ttgp-heading--progress", "\uC9C4\uD589\uB960");
  progress.dataset.column = "progress";
  const timeline = element("div", "ttgp-timeline-header");
  timeline.dataset.column = "timeline";
  timeline.style.setProperty("--tt-days", String(daysInMonth(month)));
  for (let day = 1; day <= daysInMonth(month); day += 1) {
    const dayEl = element("span", "ttgp-day", String(day));
    const date = /* @__PURE__ */ new Date(`${month}-${String(day).padStart(2, "0")}T00:00:00`);
    if (date.getDay() === 0 || date.getDay() === 6) dayEl.classList.add("is-weekend");
    timeline.append(dayEl);
  }
  header.append(tag, progress, timeline);
  root.append(header);
}
function renderRows(root, model, actions) {
  const rows = element("div", "ttgp-rows");
  const dayCount = daysInMonth(model.month);
  for (const row of model.rows) {
    const selected = row.tagKey === model.selectedTagKey;
    const rowEl = element("div", `ttgp-row${selected ? " is-selected" : ""}`);
    rowEl.setAttribute("role", "button");
    rowEl.tabIndex = 0;
    rowEl.setAttribute("aria-expanded", String(selected));
    rowEl.setAttribute("aria-label", `${row.displayName}, ${row.completed}/${row.total}, ${row.percent}%`);
    const select = () => actions.onSelectTag(row.tagKey);
    rowEl.addEventListener("click", select);
    rowEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select();
      }
    });
    const tag = element("div", "ttgp-tag-cell");
    tag.append(element("span", "ttgp-tag-mark"), element("strong", "ttgp-tag-name", row.displayName));
    if (row.unscheduledCount > 0) tag.append(element("span", "ttgp-unscheduled", `+${row.unscheduledCount} \uAE30\uAC04 \uBBF8\uC9C0\uC815`));
    const progress = element("div", "ttgp-progress-cell");
    progress.append(element("strong", "ttgp-fraction", `${row.completed}/${row.total}`), element("span", "ttgp-percent", `${row.percent}%`));
    const timeline = element("div", "ttgp-timeline-cell");
    timeline.style.setProperty("--tt-days", String(dayCount));
    if (row.total === 0 || row.visibleStartDay === void 0 || row.visibleEndDay === void 0) {
      timeline.append(element("span", "ttgp-no-schedule", "\uAE30\uAC04 \uBBF8\uC9C0\uC815"));
    } else {
      const track = element("div", "ttgp-track");
      track.style.gridColumn = `${row.visibleStartDay} / ${row.visibleEndDay + 1}`;
      const done = element("span", "ttgp-segment ttgp-segment--done");
      done.style.width = `${row.percent}%`;
      const open = element("span", "ttgp-segment ttgp-segment--open");
      open.style.width = `${100 - row.percent}%`;
      track.title = `${row.displayName}: \uC644\uB8CC ${row.completed}, \uBBF8\uC644\uB8CC ${row.open}, \uC804\uCCB4 ${row.total}`;
      track.append(done, open);
      timeline.append(track);
    }
    rowEl.append(tag, progress, timeline);
    rows.append(rowEl);
  }
  root.append(rows);
}
function renderDrilldown(root, model, actions) {
  if (!model.selectedTagKey) return;
  const selectedRow = model.rows.find((row) => row.tagKey === model.selectedTagKey);
  if (!selectedRow) return;
  const taskIds = new Set(selectedRow.taskIds);
  const tasks = model.tasks.filter((task) => taskIds.has(task.id));
  const panel = element("section", "ttgp-drilldown");
  const header = element("div", "ttgp-drilldown-header");
  const title = element("div");
  title.append(element("span", "ttgp-eyebrow", "SELECTED TAG"), element("h3", void 0, `${selectedRow.displayName} \uD0DC\uC2A4\uD06C`));
  const bases = button("Bases \uC804\uCCB4 \uB178\uD2B8\uC5D0\uC11C \uC5F4\uAE30", `${selectedRow.displayName}\uC758 \uC0DD\uC131\uB41C \uB178\uD2B8\uB97C Bases\uC5D0\uC11C \uC5F4\uAE30`);
  bases.classList.add("ttgp-button--bases");
  bases.addEventListener("click", () => actions.onOpenBases(selectedRow.tagKey));
  header.append(title, bases);
  const list = element("ul", "ttgp-task-list");
  for (const task of tasks) {
    const item = element("li", "ttgp-task");
    const completed = task.status === "completed";
    const state = element("button", `ttgp-task-toggle ttgp-task-toggle--${task.status}`, completed ? "\u2713" : "");
    state.type = "button";
    state.setAttribute("role", "checkbox");
    state.setAttribute("aria-checked", String(completed));
    state.setAttribute("aria-label", completed ? `${task.title}, \uC644\uB8CC\uB428` : `${task.title}, TickTick\uC5D0\uC11C \uC644\uB8CC \uCC98\uB9AC`);
    state.title = completed ? "\uC644\uB8CC\uB41C \uD0DC\uC2A4\uD06C" : "TickTick\uC5D0\uC11C \uC644\uB8CC \uCC98\uB9AC";
    state.disabled = completed;
    if (!completed) state.addEventListener("click", () => actions.onRequestComplete(task.id));
    const detail = element("button", "ttgp-task-open");
    detail.type = "button";
    detail.setAttribute("aria-label", `${task.title} \uB178\uD2B8 \uC0DD\uC131 \uB610\uB294 \uC5F4\uAE30`);
    detail.title = "\uD0DC\uC2A4\uD06C \uB178\uD2B8 \uC0DD\uC131 \uB610\uB294 \uC5F4\uAE30";
    detail.append(element("strong", void 0, task.title), element("span", void 0, task.localDueDate ?? "\uAE30\uAC04 \uBBF8\uC9C0\uC815"));
    detail.addEventListener("click", (event) => actions.onOpenTask(task.id, event.ctrlKey || event.metaKey));
    item.append(state, detail);
    list.append(item);
  }
  panel.append(header, list);
  root.append(panel);
}
function renderDashboard(root, model, actions) {
  root.replaceChildren();
  root.classList.add("ttgp-dashboard");
  renderToolbar(root, model, actions);
  if (model.status === "empty" && model.rows.length === 0) {
    root.append(element("div", "ttgp-empty", "\uC774 \uC6D4 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uB3D9\uAE30\uD654\uB97C \uC2E4\uD589\uD558\uC138\uC694."));
    return;
  }
  const board = element("section", "ttgp-board");
  board.setAttribute("aria-label", `${formatMonth(model.month)} \uD0DC\uADF8\uBCC4 \uC9C4\uD589\uB960`);
  renderHeader(board, model.month);
  renderRows(board, model, actions);
  root.append(board);
  renderDrilldown(root, model, actions);
}

// src/ui/dashboard-view.ts
var DASHBOARD_VIEW_TYPE = "ticktick-tag-progress-dashboard";
function currentMonth() {
  const now = /* @__PURE__ */ new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function offsetMonth(month, offset) {
  const [yearText, monthText] = month.split("-");
  const date = new Date(Number(yearText), Number(monthText) - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
var GanttDashboardView = class extends import_obsidian3.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  month = currentMonth();
  selectedTagKey;
  getViewType() {
    return DASHBOARD_VIEW_TYPE;
  }
  getDisplayText() {
    return "TickTick \uD0DC\uADF8 \uC9C4\uD589\uB960";
  }
  getIcon() {
    return "chart-gantt";
  }
  async onOpen() {
    this.render();
  }
  render() {
    renderDashboard(this.contentEl, this.plugin.getDashboardModel(this.month, this.selectedTagKey), {
      onMonthChange: (offset) => {
        this.month = offsetMonth(this.month, offset);
        this.selectedTagKey = void 0;
        this.render();
      },
      onSync: () => {
        void this.plugin.syncMonth(this.month);
      },
      onSelectTag: (tagKey) => {
        this.selectedTagKey = tagKey;
        this.render();
      },
      onRequestComplete: (taskId) => {
        this.plugin.requestTaskCompletion(this.month, taskId);
      },
      onOpenTask: (taskId, newPane) => {
        void this.plugin.openTaskNote(this.month, taskId, newPane);
      },
      onOpenBases: (tagKey) => {
        void this.plugin.openProjectsBase(tagKey);
      }
    });
  }
};

// src/ui/task-completion-modal.ts
var import_obsidian4 = require("obsidian");
var TaskCompletionModal = class extends import_obsidian4.Modal {
  constructor(app, task, onConfirm) {
    super(app);
    this.task = task;
    this.onConfirm = onConfirm;
  }
  onOpen() {
    this.setTitle("TickTick \uC644\uB8CC \uCC98\uB9AC \uD655\uC778");
    this.modalEl.addClass("ttgp-completion-modal");
    this.contentEl.replaceChildren();
    const intro = document.createElement("p");
    intro.className = "ttgp-completion-intro";
    intro.textContent = "\uB2E4\uC74C \uD0DC\uC2A4\uD06C\uB97C TickTick\uC5D0\uC11C \uC644\uB8CC \uC0C1\uD0DC\uB85C \uBCC0\uACBD\uD569\uB2C8\uB2E4.";
    const preview = document.createElement("dl");
    preview.className = "ttgp-completion-preview";
    this.addPreviewRow(preview, "\uD0DC\uC2A4\uD06C", this.task.title);
    this.addPreviewRow(preview, "\uD504\uB85C\uC81D\uD2B8", this.task.projectName);
    this.addPreviewRow(preview, "\uBCC0\uACBD", "\uBBF8\uC644\uB8CC \u2192 \uC644\uB8CC");
    const note = document.createElement("p");
    note.className = "ttgp-completion-note";
    note.textContent = "\uC644\uB8CC \uCC98\uB9AC \uD6C4 \uD604\uC7AC \uC6D4 \uB370\uC774\uD130\uB97C \uB2E4\uC2DC \uB3D9\uAE30\uD654\uD569\uB2C8\uB2E4.";
    const error = document.createElement("p");
    error.className = "ttgp-completion-error";
    error.setAttribute("role", "alert");
    error.hidden = true;
    const controls = document.createElement("div");
    controls.className = "ttgp-completion-actions";
    const cancel = new import_obsidian4.ButtonComponent(controls).setButtonText("\uCDE8\uC18C").onClick(() => this.close());
    const confirm = new import_obsidian4.ButtonComponent(controls).setButtonText("TickTick\uC5D0\uC11C \uC644\uB8CC \uCC98\uB9AC").setCta().onClick(() => {
      void submit();
    });
    const submit = async () => {
      cancel.setDisabled(true);
      confirm.setDisabled(true).setButtonText("\uC644\uB8CC \uCC98\uB9AC \uC911\u2026");
      error.hidden = true;
      try {
        await this.onConfirm();
        this.close();
      } catch (reason) {
        error.textContent = reason instanceof Error ? reason.message : "\uC644\uB8CC \uCC98\uB9AC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
        error.hidden = false;
        cancel.setDisabled(false);
        confirm.setDisabled(false).setButtonText("\uB2E4\uC2DC \uC2DC\uB3C4");
      }
    };
    this.contentEl.append(intro, preview, note, error, controls);
  }
  onClose() {
    this.contentEl.replaceChildren();
  }
  addPreviewRow(container, label, value) {
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = value;
    container.append(term, description);
  }
};

// src/main.ts
var transport = async (request) => {
  const response = await (0, import_obsidian5.requestUrl)({
    url: request.url,
    method: request.method,
    headers: request.headers,
    ...request.body === void 0 ? {} : { body: request.body },
    contentType: "application/json",
    throw: false
  });
  return { status: response.status, json: response.text.trim() ? response.json : null };
};
var TickTickTagProgressPlugin = class extends import_obsidian5.Plugin {
  snapshotStore;
  api;
  syncService;
  taskCompletion;
  taskNotes;
  syncing = false;
  async onload() {
    const raw = await this.loadData();
    this.settings = loadSettings(raw?.settings);
    this.snapshotStore = new SnapshotStore(raw?.snapshotState ?? { snapshots: {} });
    this.api = new OfficialOpenApiClient(
      () => this.app.secretStorage.getSecret(this.settings.secretName),
      transport
    );
    this.syncService = new SyncService(this.api, this.snapshotStore);
    this.taskCompletion = new TaskCompletionService(this.api, this.syncService);
    this.taskNotes = new TaskNoteRepository(new ObsidianTaskNotePort(this.app), this.settings.projectAliases);
    this.registerView(DASHBOARD_VIEW_TYPE, (leaf) => new GanttDashboardView(leaf, this));
    this.addRibbonIcon("chart-gantt", "TickTick \uD0DC\uADF8 \uC9C4\uD589\uB960", () => {
      void this.activateDashboard();
    });
    this.addCommand({ id: "open-dashboard", name: "\uD0DC\uADF8\uBCC4 \uC9C4\uD589\uB960 \uB300\uC2DC\uBCF4\uB4DC \uC5F4\uAE30", callback: () => {
      void this.activateDashboard();
    } });
    this.addCommand({ id: "sync-current-month", name: "\uD604\uC7AC \uC6D4 \uC218\uB3D9 \uB3D9\uAE30\uD654", callback: () => {
      void this.syncMonth(this.currentMonth());
    } });
    this.addCommand({ id: "ensure-projects-base", name: "Projects.base TickTick \uBDF0 \uC5F0\uACB0", callback: () => {
      void this.ensureProjectsBase();
    } });
    this.addSettingTab(new TickTickTagProgressSettingTab(this));
  }
  onunload() {
    this.app.workspace.detachLeavesOfType(DASHBOARD_VIEW_TYPE);
  }
  currentMonth() {
    const now = /* @__PURE__ */ new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }
  async savePluginData() {
    await this.saveData({ settings: this.settings, snapshotState: this.snapshotStore.exportState() });
  }
  async activateDashboard() {
    let leaf = this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({ type: DASHBOARD_VIEW_TYPE, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
  }
  refreshViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)) {
      if (leaf.view instanceof GanttDashboardView) leaf.view.render();
    }
  }
  getDashboardModel(month, selectedTagKey) {
    const snapshot = this.snapshotStore.getLastGood(month);
    const lastAttempt = this.snapshotStore.getLastAttempt();
    if (!snapshot) {
      const result = lastAttempt?.selectedMonth === month ? lastAttempt.result : void 0;
      return {
        month,
        status: this.syncing ? "syncing" : result === "auth" ? "auth" : result === "contract" ? "contract" : "empty",
        uniqueTaskCount: 0,
        selectedTagKey,
        rows: [],
        tasks: []
      };
    }
    const include = new Set(this.settings.includeTags.map(normalizeTagKey));
    const exclude = new Set(this.settings.excludeTags.map(normalizeTagKey));
    const rows = aggregateTagProgress(snapshot.tasks, month, { showUntagged: this.settings.showUntagged }).filter((row) => (include.size === 0 || include.has(row.tagKey)) && !exclude.has(row.tagKey));
    const scheduled = snapshot.tasks.filter((task) => {
      const start = task.localStartDate ?? task.localDueDate;
      const due = task.localDueDate ?? task.localStartDate;
      return Boolean(start && due && clampTaskToMonth(start, due, month));
    });
    const failedAfterSnapshot = lastAttempt && lastAttempt.selectedMonth === month && lastAttempt.result !== "success" && lastAttempt.attemptedAt > snapshot.generatedAt;
    return {
      month,
      status: this.syncing ? "syncing" : failedAfterSnapshot ? "stale" : "complete",
      lastSuccessAt: snapshot.generatedAt,
      uniqueTaskCount: new Set(scheduled.map((task) => task.id)).size,
      selectedTagKey,
      rows,
      tasks: snapshot.tasks
    };
  }
  async syncMonth(month) {
    if (this.syncing) return;
    this.syncing = true;
    this.refreshViews();
    try {
      await this.syncService.sync(month);
      await this.savePluginData();
      new import_obsidian5.Notice(`${month} TickTick \uD0DC\uADF8 \uC9C4\uD589\uB960 \uB3D9\uAE30\uD654 \uC644\uB8CC`);
    } catch (error) {
      await this.savePluginData();
      const message = error instanceof TickTickHttpError && error.kind === "auth" ? "TickTick \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4. \uD50C\uB7EC\uADF8\uC778 \uC124\uC815\uC5D0\uC11C SecretStorage \uD1A0\uD070\uC744 \uD655\uC778\uD558\uC138\uC694." : "TickTick \uB3D9\uAE30\uD654\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uB9C8\uC9C0\uB9C9 \uC131\uACF5 \uB370\uC774\uD130\uB294 \uC720\uC9C0\uB429\uB2C8\uB2E4.";
      new import_obsidian5.Notice(message, 8e3);
    } finally {
      this.syncing = false;
      this.refreshViews();
    }
  }
  async testConnection() {
    try {
      const projects = await this.api.getProjects();
      new import_obsidian5.Notice(`TickTick \uACF5\uC2DD API \uC5F0\uACB0 \uC131\uACF5 \xB7 \uD504\uB85C\uC81D\uD2B8 ${projects.length}\uAC1C`);
    } catch (error) {
      new import_obsidian5.Notice(error instanceof TickTickHttpError && error.kind === "auth" ? "API \uD1A0\uD070\uC744 \uD655\uC778\uD558\uC138\uC694." : "TickTick \uC5F0\uACB0 \uD655\uC778\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.", 8e3);
    }
  }
  async openTaskNote(month, taskId, newPane) {
    const snapshot = this.snapshotStore.getLastGood(month);
    const summary = snapshot?.tasks.find((task) => task.id === taskId);
    if (!snapshot || !summary) {
      new import_obsidian5.Notice("\uC120\uD0DD\uD55C \uD0DC\uC2A4\uD06C\uAC00 \uD604\uC7AC snapshot\uC5D0 \uC5C6\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uB3D9\uAE30\uD654\uD558\uC138\uC694.");
      return;
    }
    try {
      const detail = await this.api.getTask(summary.projectId, summary.id);
      const task = normalizeTask(detail, summary.projectName);
      await this.taskNotes.openOrCreate(task, {
        syncedAt: (/* @__PURE__ */ new Date()).toISOString(),
        snapshotAt: snapshot.generatedAt,
        coverage: snapshot.coverage.status
      }, newPane);
    } catch (error) {
      new import_obsidian5.Notice(error instanceof Error ? `\uD0DC\uC2A4\uD06C \uB178\uD2B8\uB97C \uC5F4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4: ${error.message}` : "\uD0DC\uC2A4\uD06C \uB178\uD2B8\uB97C \uC5F4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", 8e3);
    }
  }
  requestTaskCompletion(month, taskId) {
    const snapshot = this.snapshotStore.getLastGood(month);
    const task = snapshot?.tasks.find((candidate) => candidate.id === taskId);
    if (!task) {
      new import_obsidian5.Notice("\uC120\uD0DD\uD55C \uD0DC\uC2A4\uD06C\uAC00 \uD604\uC7AC snapshot\uC5D0 \uC5C6\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uB3D9\uAE30\uD654\uD558\uC138\uC694.");
      return;
    }
    if (task.status !== "open") {
      new import_obsidian5.Notice("\uC774\uBBF8 \uC644\uB8CC\uB418\uC5C8\uAC70\uB098 \uC644\uB8CC\uD560 \uC218 \uC5C6\uB294 \uD0DC\uC2A4\uD06C\uC785\uB2C8\uB2E4.");
      return;
    }
    if (this.syncing) {
      new import_obsidian5.Notice("\uD604\uC7AC \uB3D9\uAE30\uD654\uAC00 \uB05D\uB09C \uB4A4 \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC138\uC694.");
      return;
    }
    new TaskCompletionModal(this.app, task, async () => {
      await this.completeTaskAndRefresh(month, task);
    }).open();
  }
  async completeTaskAndRefresh(month, task) {
    if (this.syncing) throw new Error("\uD604\uC7AC \uB3D9\uAE30\uD654\uAC00 \uB05D\uB09C \uB4A4 \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC138\uC694.");
    this.syncing = true;
    this.refreshViews();
    try {
      await this.taskCompletion.completeAndRefresh(month, task);
      await this.savePluginData();
      new import_obsidian5.Notice(`\u201C${task.title}\u201D\uC744 TickTick\uC5D0\uC11C \uC644\uB8CC \uCC98\uB9AC\uD588\uC2B5\uB2C8\uB2E4.`);
    } catch (error) {
      await this.savePluginData();
      if (error instanceof CompletionRefreshError) {
        new import_obsidian5.Notice("TickTick \uC644\uB8CC \uCC98\uB9AC\uB294 \uC131\uACF5\uD588\uC9C0\uB9CC \uD654\uBA74 \uC7AC\uB3D9\uAE30\uD654\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uB3D9\uAE30\uD654 \uBC84\uD2BC\uC744 \uB2E4\uC2DC \uB204\uB974\uC138\uC694.", 9e3);
        return;
      }
      const message = error instanceof TickTickHttpError && error.kind === "auth" ? "TickTick \uC778\uC99D\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. API \uD1A0\uD070\uC744 \uD655\uC778\uD558\uC138\uC694." : "TickTick \uC644\uB8CC \uCC98\uB9AC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uD0DC\uC2A4\uD06C\uB294 \uBCC0\uACBD\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.";
      new import_obsidian5.Notice(message, 8e3);
      throw new Error(message);
    } finally {
      this.syncing = false;
      this.refreshViews();
    }
  }
  async ensureProjectsBase() {
    const path = (0, import_obsidian5.normalizePath)(this.settings.projectsBasePath);
    const file = this.app.vault.getFileByPath(path);
    if (!(file instanceof import_obsidian5.TFile)) {
      new import_obsidian5.Notice(`Projects.base\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4: ${path}`);
      return;
    }
    try {
      let changed = false;
      await this.app.vault.process(file, (source) => {
        const patched = addTickTickView(source);
        changed = patched !== source;
        return patched;
      });
      new import_obsidian5.Notice(changed ? "Projects.base\uC5D0 TickTick Task Notes \uBDF0\uB97C \uCD94\uAC00\uD588\uC2B5\uB2C8\uB2E4." : "Projects.base \uC5F0\uACB0\uC774 \uC774\uBBF8 \uC900\uBE44\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.");
    } catch (error) {
      new import_obsidian5.Notice(error instanceof Error ? `Projects.base \uC5F0\uACB0 \uC2E4\uD328: ${error.message}` : "Projects.base \uC5F0\uACB0 \uC2E4\uD328", 8e3);
    }
  }
  async openProjectsBase(tagKey) {
    const path = (0, import_obsidian5.normalizePath)(this.settings.projectsBasePath);
    const file = this.app.vault.getFileByPath(path);
    if (!(file instanceof import_obsidian5.TFile)) {
      new import_obsidian5.Notice(`Projects.base\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4: ${path}`);
      return;
    }
    await this.app.workspace.getLeaf("tab").openFile(file);
    if (tagKey) new import_obsidian5.Notice(`Bases\uC5D0\uC11C TickTick Task Notes \uBDF0\uB97C \uC120\uD0DD\uD55C \uB4A4 ticktickTags\uC5D0 \u201C${tagKey}\u201D \uD544\uD130\uB97C \uC801\uC6A9\uD558\uC138\uC694.`, 7e3);
  }
};

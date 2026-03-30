import Database from "better-sqlite3";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

const APP_DIR = path.join(os.homedir(), ".local", "share", "qwen-proxy");
const DB_PATH = path.join(APP_DIR, "usage.db");

const LEGACY_JSON_PATH = path.join(os.homedir(), ".qwen", "request_counts.json");

export type UsageEntry = {
  account_id: string;
  date: string;
  requests: number;
  requests_known: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cache_types: string;
};

export type DailyUsage = {
  date: string;
  requests: number;
  requestsKnown: boolean;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cacheTypes: string[];
};

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("synchronous = NORMAL");
  return _db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_usage (
      account_id      TEXT    NOT NULL,
      date            TEXT    NOT NULL,
      requests        INTEGER NOT NULL DEFAULT 0,
      requests_known  INTEGER NOT NULL DEFAULT 1,
      input_tokens    INTEGER NOT NULL DEFAULT 0,
      output_tokens   INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
      cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      cache_types     TEXT    NOT NULL DEFAULT '',
      PRIMARY KEY (account_id, date)
    );

    CREATE TABLE IF NOT EXISTS daily_request_counts (
      account_id  TEXT    NOT NULL PRIMARY KEY,
      reset_date  TEXT    NOT NULL,
      count       INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS web_search_counts (
      account_id     TEXT    NOT NULL PRIMARY KEY,
      request_count  INTEGER NOT NULL DEFAULT 0,
      result_count   INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

async function migrateLegacyJson(db: Database.Database): Promise<void> {
  const alreadyMigrated = (db.prepare("SELECT value FROM meta WHERE key = 'migrated_json'").get() as any)?.value;
  if (alreadyMigrated === "1") return;

  let raw: string;
  try {
    raw = await fs.readFile(LEGACY_JSON_PATH, "utf8");
  } catch {
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('migrated_json', '1')").run();
    return;
  }

  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('migrated_json', '1')").run();
    return;
  }

  const insertUsage = db.prepare(`
    INSERT OR IGNORE INTO daily_usage
      (account_id, date, requests, requests_known, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cache_types)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertCount = db.prepare(`
    INSERT OR IGNORE INTO daily_request_counts (account_id, reset_date, count) VALUES (?, ?, ?)
  `);

  const resetDate: string = typeof data.lastResetDate === "string" ? data.lastResetDate : new Date().toISOString().split("T")[0]!;

  const migrate = db.transaction(() => {
    if (data.requests && typeof data.requests === "object") {
      for (const [accountId, count] of Object.entries(data.requests)) {
        insertCount.run(accountId, resetDate, Number(count) || 0);
      }
    }

    if (data.tokenUsage && typeof data.tokenUsage === "object") {
      for (const [accountId, entries] of Object.entries(data.tokenUsage)) {
        if (!Array.isArray(entries)) continue;
        for (const entry of entries as any[]) {
          const cacheTypes = Array.isArray(entry.cacheTypes)
            ? entry.cacheTypes.filter((s: unknown) => typeof s === "string").join(",")
            : typeof entry.cacheType === "string" ? entry.cacheType : "";

          insertUsage.run(
            accountId,
            String(entry.date || resetDate),
            Number(entry.requests) || 0,
            entry.requestsKnown === false ? 0 : 1,
            Number(entry.inputTokens) || 0,
            Number(entry.outputTokens) || 0,
            Number(entry.cacheReadTokens) || 0,
            Number(entry.cacheWriteTokens) || 0,
            cacheTypes,
          );
        }
      }
    }

    if (data.webSearchRequests && typeof data.webSearchRequests === "object") {
      const insertWeb = db.prepare(`
        INSERT OR IGNORE INTO web_search_counts (account_id, request_count, result_count) VALUES (?, ?, ?)
      `);
      for (const [accountId, count] of Object.entries(data.webSearchRequests)) {
        const resultCount = data.webSearchResults?.[accountId] ?? 0;
        insertWeb.run(accountId, Number(count) || 0, Number(resultCount) || 0);
      }
    }

    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('migrated_json', '1')").run();
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('last_reset_date', ?)").run(resetDate);
  });

  migrate();

  const backupPath = `${LEGACY_JSON_PATH}.migrated.bak`;
  try {
    await fs.rename(LEGACY_JSON_PATH, backupPath);
  } catch {
    /* best effort */
  }

  console.log(`[usageStore] migrated ${LEGACY_JSON_PATH} -> SQLite at ${DB_PATH}`);
  console.log(`[usageStore] legacy JSON backed up to ${backupPath}`);
}

export async function openUsageStore(): Promise<void> {
  await fs.mkdir(APP_DIR, { recursive: true });
  const db = getDb();
  initSchema(db);
  await migrateLegacyJson(db);
}

export function getLastResetDate(): string {
  const db = getDb();
  const row = db.prepare("SELECT value FROM meta WHERE key = 'last_reset_date'").get() as any;
  return row?.value ?? new Date().toISOString().split("T")[0]!;
}

export function setLastResetDate(date: string): void {
  const db = getDb();
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('last_reset_date', ?)").run(date);
}

export function getTodayRequestCount(accountId: string, resetDate: string): number {
  const db = getDb();
  const row = db.prepare(
    "SELECT count FROM daily_request_counts WHERE account_id = ? AND reset_date = ?"
  ).get(accountId, resetDate) as any;
  return row?.count ?? 0;
}

export function getAllTodayRequestCounts(resetDate: string): Map<string, number> {
  const db = getDb();
  const rows = db.prepare(
    "SELECT account_id, count FROM daily_request_counts WHERE reset_date = ?"
  ).all(resetDate) as any[];
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.account_id, row.count);
  }
  return map;
}

export function incrementRequestCount(accountId: string, resetDate: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO daily_request_counts (account_id, reset_date, count) VALUES (?, ?, 1)
    ON CONFLICT(account_id) DO UPDATE SET
      count = CASE WHEN reset_date = excluded.reset_date THEN count + 1 ELSE 1 END,
      reset_date = excluded.reset_date
  `).run(accountId, resetDate);
}

export function resetRequestCounts(newDate: string): void {
  const db = getDb();
  db.prepare("DELETE FROM daily_request_counts").run();
  setLastResetDate(newDate);
}

export function recordTokenUsage(
  accountId: string,
  date: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheWriteTokens: number,
  cacheType: string | null,
): void {
  const db = getDb();

  db.prepare(`
    INSERT INTO daily_usage (account_id, date, requests, requests_known, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cache_types)
    VALUES (?, ?, 0, 1, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id, date) DO UPDATE SET
      input_tokens       = input_tokens + excluded.input_tokens,
      output_tokens      = output_tokens + excluded.output_tokens,
      cache_read_tokens  = cache_read_tokens + excluded.cache_read_tokens,
      cache_write_tokens = cache_write_tokens + excluded.cache_write_tokens,
      cache_types        = CASE
        WHEN excluded.cache_types = '' THEN cache_types
        WHEN cache_types = '' THEN excluded.cache_types
        WHEN (',' || cache_types || ',') LIKE ('%,' || excluded.cache_types || ',%') THEN cache_types
        ELSE cache_types || ',' || excluded.cache_types
      END
  `).run(
    accountId,
    date,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    cacheType ?? "",
  );
}

export function incrementUsageRequests(accountId: string, date: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO daily_usage (account_id, date, requests, requests_known, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cache_types)
    VALUES (?, ?, 1, 1, 0, 0, 0, 0, '')
    ON CONFLICT(account_id, date) DO UPDATE SET
      requests = requests + 1,
      requests_known = 1
  `).run(accountId, date);
}

export function getAllUsage(): Map<string, DailyUsage[]> {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM daily_usage ORDER BY account_id, date"
  ).all() as UsageEntry[];

  const result = new Map<string, DailyUsage[]>();
  for (const row of rows) {
    const cacheTypes = row.cache_types
      ? row.cache_types.split(",").filter((s) => s.length > 0)
      : [];

    const entry: DailyUsage = {
      date: row.date,
      requests: row.requests,
      requestsKnown: row.requests_known === 1,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      cacheReadTokens: row.cache_read_tokens,
      cacheWriteTokens: row.cache_write_tokens,
      cacheTypes,
    };

    const existing = result.get(row.account_id) ?? [];
    existing.push(entry);
    result.set(row.account_id, existing);
  }
  return result;
}

export function incrementWebSearchRequest(accountId: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO web_search_counts (account_id, request_count, result_count) VALUES (?, 1, 0)
    ON CONFLICT(account_id) DO UPDATE SET request_count = request_count + 1
  `).run(accountId);
}

export function incrementWebSearchResults(accountId: string, count: number): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO web_search_counts (account_id, request_count, result_count) VALUES (?, 0, ?)
    ON CONFLICT(account_id) DO UPDATE SET result_count = result_count + excluded.result_count
  `).run(accountId, count);
}

export function getWebSearchCounts(accountId: string): { requests: number; results: number } {
  const db = getDb();
  const row = db.prepare(
    "SELECT request_count, result_count FROM web_search_counts WHERE account_id = ?"
  ).get(accountId) as any;
  return { requests: row?.request_count ?? 0, results: row?.result_count ?? 0 };
}

export function getTotalWebSearchCounts(): { requests: number; results: number } {
  const db = getDb();
  const row = db.prepare(
    "SELECT COALESCE(SUM(request_count),0) as requests, COALESCE(SUM(result_count),0) as results FROM web_search_counts"
  ).get() as any;
  return { requests: row?.requests ?? 0, results: row?.results ?? 0 };
}

export function closeUsageStore(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

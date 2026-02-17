// @ts-nocheck
const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const { Client, Pool } = require('pg');

const DEFAULT_SQLITE_FILENAME = 'cache.sqlite';
const DEFAULT_FLUSH_DEBOUNCE_MS = 800;
const DEFAULT_SYNC_BATCH_SIZE = 50;
const DEFAULT_SYNC_PULL_INTERVAL_MS = 15000;
const DEFAULT_SYNC_BACKOFF_BASE_MS = 1000;
const DEFAULT_SYNC_BACKOFF_MAX_MS = 60000;

function nowMs() {
  return Date.now();
}

function toIso(ms) {
  if (!ms || !Number.isFinite(ms)) return '';
  return new Date(ms).toISOString();
}

function deepClone(value) {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value));
}

function stableHash(raw) {
  return crypto
    .createHash('sha1')
    .update(String(raw || ''))
    .digest('hex');
}

function safeJsonParse(text, fallback = null) {
  if (typeof text !== 'string' || !text.trim()) return fallback;
  try {
    return JSON.parse(text);
  } catch (_error) {
    return fallback;
  }
}

function calcBackoffMs(attempts) {
  const power = Math.max(0, Number(attempts || 0));
  return Math.min(DEFAULT_SYNC_BACKOFF_MAX_MS, DEFAULT_SYNC_BACKOFF_BASE_MS * 2 ** power);
}

function parseRev(rev) {
  const source = String(rev || '').trim();
  if (!source) {
    return { revNo: 0, revTag: '' };
  }
  const [rawNo, rawTag] = source.split('-');
  const revNo = Number(rawNo);
  return {
    revNo: Number.isFinite(revNo) ? revNo : 0,
    revTag: rawTag || '',
  };
}

function buildRev(revNo, revTag) {
  return `${Number(revNo || 0)}-${String(revTag || '').trim() || randomTag()}`;
}

function randomTag() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
}

function normalizePostgresUrl(raw) {
  let value = String(raw || '').trim();
  if (!value) return '';

  const hasWrappingQuotes =
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('`') && value.endsWith('`'));

  if (hasWrappingQuotes && value.length > 1) {
    value = value.slice(1, -1).trim();
  }

  // Supabase docs commonly use "postgresql://"; pg accepts both.
  // Canonicalize to a single scheme to avoid duplicate reconnection churn.
  if (/^postgresql:\/\//i.test(value)) {
    return value.replace(/^postgresql:\/\//i, 'postgres://');
  }

  return value;
}

function extractConversationPreview(sessionObject) {
  const messages = Array.isArray(sessionObject?.chat_show)
    ? sessionObject.chat_show
    : Array.isArray(sessionObject?.history)
      ? sessionObject.history
      : [];

  const candidate = messages.find((msg) => msg?.role === 'user' || msg?.role === 'assistant');
  if (!candidate) return '';

  const content = candidate.content;
  if (typeof content === 'string') {
    return content.slice(0, 120).trim();
  }
  if (Array.isArray(content)) {
    const textParts = content
      .filter((part) => part && part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text.trim())
      .filter(Boolean);
    return textParts.join(' ').slice(0, 120).trim();
  }
  return '';
}

function isSessionPayload(sessionObject) {
  if (!sessionObject || typeof sessionObject !== 'object') return false;
  if (sessionObject.anywhere_history === true) return true;
  if (Array.isArray(sessionObject.chat_show)) return true;
  if (Array.isArray(sessionObject.history)) return true;
  return false;
}

function extractPostgresUrlFromConfigDoc(docData) {
  const value = docData?.config?.database?.postgresUrl;
  return normalizePostgresUrl(value);
}

function maskPostgresUrl(url) {
  const source = normalizePostgresUrl(url);
  if (!source) return '';

  try {
    const parsed = new URL(source);
    const host = parsed.hostname || 'unknown';
    const port = parsed.port ? `:${parsed.port}` : '';
    const dbName = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname.slice(1) : '';
    return dbName ? `${host}${port}/${dbName}` : `${host}${port}`;
  } catch (_error) {
    const atIndex = source.lastIndexOf('@');
    if (atIndex >= 0 && atIndex < source.length - 1) {
      return source.slice(atIndex + 1);
    }
    return 'configured';
  }
}

async function testPostgresConnection(connectionString) {
  const dsn = normalizePostgresUrl(connectionString);
  if (!dsn) {
    return {
      ok: false,
      error: 'Postgres connection string is empty.',
    };
  }

  const client = new Client({
    connectionString: dsn,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
  });

  try {
    await client.connect();
    await client.query('SELECT 1');
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: String(error?.message || error),
    };
  } finally {
    try {
      await client.end();
    } catch (_endError) {
      // ignore
    }
  }
}

class StorageService {
  constructor(options = {}) {
    this.dataRoot = options.dataRoot;
    this.legacyDocsPath = options.legacyDocsPath || '';
    this.sqliteFilename = options.sqliteFilename || DEFAULT_SQLITE_FILENAME;
    this.flushDebounceMs =
      Number.isFinite(options.flushDebounceMs) && options.flushDebounceMs > 0
        ? Number(options.flushDebounceMs)
        : DEFAULT_FLUSH_DEBOUNCE_MS;
    this.syncBatchSize =
      Number.isFinite(options.syncBatchSize) && options.syncBatchSize > 0
        ? Number(options.syncBatchSize)
        : DEFAULT_SYNC_BATCH_SIZE;
    this.syncPullIntervalMs =
      Number.isFinite(options.syncPullIntervalMs) && options.syncPullIntervalMs > 0
        ? Number(options.syncPullIntervalMs)
        : DEFAULT_SYNC_PULL_INTERVAL_MS;

    this.sqlitePath = path.join(this.dataRoot, this.sqliteFilename);

    this.SQL = null;
    this.db = null;
    this.initialized = false;
    this.initPromise = null;

    this.flushTimer = null;
    this.syncTimer = null;
    this.flushInProgress = false;
    this.syncInFlight = false;

    this.pgPool = null;
    this.pgDsn = '';
    this.pgConnected = false;
    this.onSyncSummary = typeof options.onSyncSummary === 'function' ? options.onSyncSummary : null;

    this.lastError = '';
    this.lastSyncAt = 0;
  }

  isReady() {
    return this.initialized && !!this.db;
  }

  getMode() {
    const configured = !!this.getConfiguredPostgresUrl();
    if (!configured) return 'sqlite-only';
    return this.pgConnected ? 'hybrid-online' : 'hybrid-offline';
  }

  async init() {
    if (this.initialized && this.db) return this;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._initInternal()
      .then(() => {
        this.initialized = true;
        this.initPromise = null;
        return this;
      })
      .catch((error) => {
        this.initPromise = null;
        throw error;
      });

    return this.initPromise;
  }

  async _initInternal() {
    if (!this.dataRoot) {
      throw new Error('StorageService requires dataRoot.');
    }

    await fsp.mkdir(this.dataRoot, { recursive: true });

    const initSqlJsRaw = require('sql.js/dist/sql-wasm.js');
    const initSqlJs =
      typeof initSqlJsRaw === 'function' ? initSqlJsRaw : initSqlJsRaw.default || initSqlJsRaw;
    const wasmBinary = fs.readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'));

    this.SQL = await initSqlJs({ wasmBinary });

    if (fs.existsSync(this.sqlitePath)) {
      const fileBuffer = fs.readFileSync(this.sqlitePath);
      this.db = new this.SQL.Database(fileBuffer);
    } else {
      this.db = new this.SQL.Database();
    }

    this.execMany([
      'PRAGMA journal_mode = WAL;',
      'PRAGMA synchronous = NORMAL;',
      'PRAGMA temp_store = MEMORY;',
      'PRAGMA foreign_keys = ON;',
      `
      CREATE TABLE IF NOT EXISTS docs (
        id TEXT PRIMARY KEY,
        rev_no INTEGER NOT NULL,
        rev_tag TEXT NOT NULL,
        data_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        scope TEXT DEFAULT ''
      );
      `,
      `
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        assistant_code TEXT NOT NULL,
        conversation_name TEXT NOT NULL,
        preview TEXT NOT NULL DEFAULT '',
        session_json TEXT NOT NULL,
        size_bytes INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER NULL
      );
      `,
      'CREATE INDEX IF NOT EXISTS idx_conversations_assistant_updated ON conversations (assistant_code, updated_at DESC);',
      'CREATE INDEX IF NOT EXISTS idx_conversations_deleted_updated ON conversations (deleted_at, updated_at DESC);',
      `
      CREATE TABLE IF NOT EXISTS outbox (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        op TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_retry_at INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      `,
      'CREATE INDEX IF NOT EXISTS idx_outbox_retry_seq ON outbox (next_retry_at, seq);',
      `
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      `,
    ]);

    await this.runLegacyMigrations();

    this.scheduleFlush();
    this.scheduleSync(50);
  }

  async dispose() {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    await this.flushNow();

    if (this.pgPool) {
      try {
        await this.pgPool.end();
      } catch (_error) {
        // ignore
      }
      this.pgPool = null;
    }

    if (this.db) {
      try {
        this.db.close();
      } catch (_error) {
        // ignore
      }
      this.db = null;
    }

    this.initialized = false;
  }

  ensureReady() {
    if (!this.db) {
      throw new Error('StorageService is not initialized.');
    }
  }

  execMany(sqlList = []) {
    this.ensureReady();
    sqlList.forEach((sql) => {
      this.db.exec(sql);
    });
  }

  runStatement(sql, params = []) {
    this.ensureReady();
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      return rows;
    } finally {
      stmt.free();
    }
  }

  runMutation(sql, params = []) {
    this.ensureReady();
    const stmt = this.db.prepare(sql);
    try {
      stmt.run(params);
      this.scheduleFlush();
    } finally {
      stmt.free();
    }
  }

  withTransaction(fn) {
    this.ensureReady();
    this.db.exec('BEGIN IMMEDIATE TRANSACTION;');
    try {
      const result = fn();
      this.db.exec('COMMIT;');
      this.scheduleFlush();
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK;');
      throw error;
    }
  }

  scheduleFlush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushNow().catch((error) => {
        this.lastError = `SQLite flush failed: ${String(error?.message || error)}`;
      });
    }, this.flushDebounceMs);
  }

  async flushNow() {
    if (!this.db || this.flushInProgress) return;
    this.flushInProgress = true;
    try {
      const payload = Buffer.from(this.db.export());
      const tempPath = `${this.sqlitePath}.tmp`;
      await fsp.writeFile(tempPath, payload);
      await fsp.rename(tempPath, this.sqlitePath);
    } finally {
      this.flushInProgress = false;
    }
  }

  getMeta(key) {
    const rows = this.runStatement('SELECT value FROM meta WHERE key = ? LIMIT 1;', [String(key)]);
    if (!rows.length) return '';
    return String(rows[0].value || '');
  }

  setMeta(key, value) {
    const now = String(value ?? '');
    this.runMutation(
      `
      INSERT INTO meta (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
      `,
      [String(key), now],
    );
  }

  getConfiguredPostgresUrl() {
    const explicit = normalizePostgresUrl(this.pgDsn);
    if (explicit) return explicit;

    const configDoc = this.docGetSync('config');
    if (!configDoc || !configDoc.data) return '';
    return extractPostgresUrlFromConfigDoc(configDoc.data);
  }

  updateConfiguredPostgresUrl(url) {
    const normalized = normalizePostgresUrl(url);
    if (this.pgDsn === normalized) return;
    this.pgDsn = normalized;
    this.pgConnected = false;

    if (this.pgPool) {
      const pool = this.pgPool;
      this.pgPool = null;
      pool.end().catch(() => {});
    }

    if (!normalized) {
      this.lastError = '';
      return;
    }

    this.scheduleSync(100);
  }

  async ensurePostgresReady() {
    const dsn = this.getConfiguredPostgresUrl();
    if (!dsn) {
      this.pgConnected = false;
      return false;
    }

    if (this.pgPool && this.pgDsn === dsn && this.pgConnected) {
      return true;
    }

    this.updateConfiguredPostgresUrl(dsn);

    const pool = new Pool({
      connectionString: dsn,
      max: 2,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      statement_timeout: 10000,
    });

    try {
      const client = await pool.connect();
      try {
        await client.query('SELECT 1');
        await client.query(`
          CREATE TABLE IF NOT EXISTS app_docs (
            id TEXT PRIMARY KEY,
            data_json JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL
          );
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS app_conversations (
            id TEXT PRIMARY KEY,
            assistant_code TEXT NOT NULL,
            conversation_name TEXT NOT NULL,
            preview TEXT NOT NULL DEFAULT '',
            session_json JSONB NOT NULL,
            size_bytes INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            deleted_at TIMESTAMPTZ NULL
          );
        `);
        await client.query(
          'CREATE INDEX IF NOT EXISTS idx_app_conversations_assistant_updated ON app_conversations (assistant_code, updated_at DESC);',
        );
        await client.query(
          'CREATE INDEX IF NOT EXISTS idx_app_conversations_updated_id ON app_conversations (updated_at ASC, id ASC);',
        );
      } finally {
        client.release();
      }

      if (this.pgPool && this.pgPool !== pool) {
        this.pgPool.end().catch(() => {});
      }

      this.pgPool = pool;
      this.pgDsn = dsn;
      this.pgConnected = true;
      this.lastError = '';

      await this.seedOutboxForSnapshotIfNeeded(dsn);
      return true;
    } catch (error) {
      try {
        await pool.end();
      } catch (_endError) {
        // ignore
      }
      this.pgConnected = false;
      this.lastError = `Postgres connection failed: ${String(error?.message || error)}`;
      return false;
    }
  }

  async seedOutboxForSnapshotIfNeeded(dsn) {
    const fingerprint = stableHash(dsn).slice(0, 12);
    const metaKey = `pg_seeded_${fingerprint}`;
    if (this.getMeta(metaKey) === 'true') return;

    const docs = this.runStatement('SELECT id, data_json, updated_at FROM docs;');
    docs.forEach((row) => {
      this.enqueueOutbox('doc', row.id, 'upsert', {
        id: row.id,
        data: safeJsonParse(row.data_json, {}),
        updatedAt: Number(row.updated_at || nowMs()),
      });
    });

    const conversations = this.runStatement(
      `
      SELECT id, assistant_code, conversation_name, preview, session_json,
             size_bytes, created_at, updated_at, deleted_at
      FROM conversations;
      `,
    );

    conversations.forEach((row) => {
      const normalized = this.normalizeConversationForSync({
        id: row.id,
        assistantCode: row.assistant_code,
        conversationName: row.conversation_name,
        preview: row.preview,
        sessionJson: row.session_json,
        sizeBytes: Number(row.size_bytes || 0),
        createdAt: Number(row.created_at || nowMs()),
        updatedAt: Number(row.updated_at || nowMs()),
        deletedAt:
          row.deleted_at === null || row.deleted_at === undefined ? null : Number(row.deleted_at),
      });
      this.enqueueOutbox('conversation', row.id, 'upsert', {
        id: normalized.id,
        assistantCode: normalized.assistantCode,
        conversationName: normalized.conversationName,
        preview: normalized.preview,
        sessionJson: normalized.sessionJson,
        sizeBytes: normalized.sizeBytes,
        createdAt: normalized.createdAt,
        updatedAt: normalized.updatedAt,
        deletedAt: normalized.deletedAt,
      });
    });

    this.setMeta(metaKey, 'true');
    this.scheduleSync(100);
  }

  enqueueOutbox(entityType, entityId, op, payload) {
    const dsn = this.getConfiguredPostgresUrl();
    if (!dsn) return;

    this.runMutation(
      `
      INSERT INTO outbox (entity_type, entity_id, op, payload_json, attempts, next_retry_at, created_at)
      VALUES (?, ?, ?, ?, 0, 0, ?);
      `,
      [String(entityType), String(entityId), String(op), JSON.stringify(payload ?? {}), nowMs()],
    );
  }

  getOutboxQueueSize() {
    const rows = this.runStatement('SELECT COUNT(*) AS count FROM outbox;');
    return Number(rows[0]?.count || 0);
  }

  getStorageHealth() {
    const dsn = this.getConfiguredPostgresUrl();
    const configured = !!dsn;
    return {
      mode: this.getMode(),
      postgresConfigured: configured,
      postgresConnected: configured ? this.pgConnected : false,
      postgresTarget: configured ? maskPostgresUrl(dsn) : '',
      queueSize: this.getOutboxQueueSize(),
      lastSyncAt: this.lastSyncAt ? toIso(this.lastSyncAt) : '',
      lastError: this.lastError || '',
    };
  }

  emitSyncSummary(summary = {}) {
    if (typeof this.onSyncSummary !== 'function') return;
    try {
      this.onSyncSummary(summary);
    } catch (_error) {
      // ignore callback errors
    }
  }

  getPostgresFingerprint(dsn = '') {
    const source = normalizePostgresUrl(dsn);
    if (!source) return '';
    return stableHash(source).slice(0, 12);
  }

  getConversationPullCursorMetaKey(dsn = '') {
    const fingerprint = this.getPostgresFingerprint(dsn);
    if (!fingerprint) return '';
    return `pg_conversation_cursor_${fingerprint}`;
  }

  getConversationPullCursor(dsn = '') {
    const metaKey = this.getConversationPullCursorMetaKey(dsn);
    if (!metaKey) {
      return { updatedAt: 0, id: '' };
    }
    const parsed = safeJsonParse(this.getMeta(metaKey), null);
    const updatedAt = Number(parsed?.updatedAt || 0);
    return {
      updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? Math.floor(updatedAt) : 0,
      id: String(parsed?.id || ''),
    };
  }

  setConversationPullCursor(dsn = '', cursor = {}) {
    const metaKey = this.getConversationPullCursorMetaKey(dsn);
    if (!metaKey) return;
    const updatedAt = Number(cursor?.updatedAt || 0);
    this.setMeta(
      metaKey,
      JSON.stringify({
        updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? Math.floor(updatedAt) : 0,
        id: String(cursor?.id || ''),
      }),
    );
  }

  normalizeConversationForSync(raw = {}) {
    const conversationId = String(raw.conversationId || raw.id || '').trim();

    let sessionObject = raw.sessionData;
    if (!sessionObject && raw.session_json) {
      sessionObject =
        typeof raw.session_json === 'string'
          ? safeJsonParse(raw.session_json, null)
          : raw.session_json;
    }
    if (!sessionObject && raw.sessionJson) {
      sessionObject =
        typeof raw.sessionJson === 'string'
          ? safeJsonParse(raw.sessionJson, null)
          : raw.sessionJson;
    }
    if (!sessionObject || typeof sessionObject !== 'object') {
      sessionObject = {};
    }

    const assistantCode =
      String(raw.assistantCode || raw.CODE || sessionObject.CODE || 'AI').trim() || 'AI';
    const conversationName = String(
      raw.conversationName ||
        raw.name ||
        sessionObject.conversationName ||
        `Session-${assistantCode}-${new Date().toISOString().slice(0, 10)}`,
    ).trim();

    const canonicalSession = deepClone(sessionObject) || {};
    canonicalSession.CODE = assistantCode;
    canonicalSession.conversationName = conversationName;
    if (conversationId) {
      canonicalSession.conversationId = conversationId;
    }

    const sessionJson = JSON.stringify(canonicalSession);
    const createdAtRaw = Number(raw.createdAt || raw.created_at || 0);
    const updatedAtRaw = Number(raw.updatedAt || raw.updated_at || createdAtRaw || nowMs());
    const deletedAtRaw =
      raw.deletedAt === null ||
      raw.deleted_at === null ||
      raw.deletedAt === undefined ||
      raw.deleted_at === undefined
        ? null
        : Number(raw.deletedAt ?? raw.deleted_at);

    return {
      id: conversationId,
      assistantCode,
      conversationName,
      preview: String(raw.preview || extractConversationPreview(canonicalSession) || '').trim(),
      sessionObject: canonicalSession,
      sessionJson,
      sizeBytes: Number(raw.sizeBytes || raw.size_bytes || Buffer.byteLength(sessionJson, 'utf8')),
      createdAt:
        Number.isFinite(createdAtRaw) && createdAtRaw > 0
          ? Math.floor(createdAtRaw)
          : Math.floor(nowMs()),
      updatedAt:
        Number.isFinite(updatedAtRaw) && updatedAtRaw > 0
          ? Math.floor(updatedAtRaw)
          : Math.floor(nowMs()),
      deletedAt:
        deletedAtRaw === null || !Number.isFinite(deletedAtRaw) || deletedAtRaw <= 0
          ? null
          : Math.floor(deletedAtRaw),
    };
  }

  buildConversationVersionSignature(record = {}) {
    return stableHash(
      JSON.stringify({
        assistantCode: String(record.assistantCode || ''),
        conversationName: String(record.conversationName || ''),
        preview: String(record.preview || ''),
        sessionJson: String(record.sessionJson || ''),
        sizeBytes: Number(record.sizeBytes || 0),
        deletedAt:
          record.deletedAt === null || record.deletedAt === undefined
            ? null
            : Number(record.deletedAt || 0),
      }),
    );
  }

  compareConversationVersions(left, right) {
    const leftUpdatedAt = Number(left?.updatedAt || 0);
    const rightUpdatedAt = Number(right?.updatedAt || 0);
    if (leftUpdatedAt !== rightUpdatedAt) {
      return leftUpdatedAt > rightUpdatedAt ? 1 : -1;
    }

    const leftSig = this.buildConversationVersionSignature(left);
    const rightSig = this.buildConversationVersionSignature(right);
    if (leftSig === rightSig) return 0;
    return leftSig > rightSig ? 1 : -1;
  }

  async getRemoteConversationSnapshotById(client, conversationId) {
    const rows = await client.query(
      `
      SELECT id, assistant_code, conversation_name, preview, session_json::text AS session_json_text,
             size_bytes,
             EXTRACT(EPOCH FROM created_at) * 1000 AS created_at_ms,
             EXTRACT(EPOCH FROM updated_at) * 1000 AS updated_at_ms,
             CASE
               WHEN deleted_at IS NULL THEN NULL
               ELSE EXTRACT(EPOCH FROM deleted_at) * 1000
             END AS deleted_at_ms
      FROM app_conversations
      WHERE id = $1
      LIMIT 1;
      `,
      [String(conversationId || '').trim()],
    );
    if (!rows?.rows?.length) return null;

    const row = rows.rows[0];
    const remote = this.normalizeConversationForSync({
      id: row.id,
      assistantCode: row.assistant_code,
      conversationName: row.conversation_name,
      preview: row.preview,
      sessionJson:
        typeof row.session_json_text === 'string' && row.session_json_text
          ? row.session_json_text
          : row.session_json,
      sizeBytes: Number(row.size_bytes || 0),
      createdAt: Number(row.created_at_ms || 0),
      updatedAt: Number(row.updated_at_ms || 0),
      deletedAt:
        row.deleted_at_ms === null || row.deleted_at_ms === undefined
          ? null
          : Number(row.deleted_at_ms),
    });
    if (!remote.id) return null;
    return remote;
  }

  applyRemoteConversation(remoteRecord) {
    if (!remoteRecord?.id) {
      return { applied: false, stale: false };
    }

    const localRows = this.runStatement(
      `
      SELECT id, assistant_code, conversation_name, preview, session_json,
             size_bytes, created_at, updated_at, deleted_at
      FROM conversations
      WHERE id = ?
      LIMIT 1;
      `,
      [remoteRecord.id],
    );

    if (!localRows.length) {
      this.runMutation(
        `
        INSERT INTO conversations (
          id, assistant_code, conversation_name, preview,
          session_json, size_bytes, created_at, updated_at, deleted_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          assistant_code = excluded.assistant_code,
          conversation_name = excluded.conversation_name,
          preview = excluded.preview,
          session_json = excluded.session_json,
          size_bytes = excluded.size_bytes,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          deleted_at = excluded.deleted_at;
        `,
        [
          remoteRecord.id,
          remoteRecord.assistantCode,
          remoteRecord.conversationName,
          remoteRecord.preview,
          remoteRecord.sessionJson,
          remoteRecord.sizeBytes,
          remoteRecord.createdAt,
          remoteRecord.updatedAt,
          remoteRecord.deletedAt,
        ],
      );
      return { applied: true, stale: false };
    }

    const local = this.normalizeConversationForSync({
      id: localRows[0].id,
      assistantCode: localRows[0].assistant_code,
      conversationName: localRows[0].conversation_name,
      preview: localRows[0].preview,
      sessionJson: localRows[0].session_json,
      sizeBytes: Number(localRows[0].size_bytes || 0),
      createdAt: Number(localRows[0].created_at || 0),
      updatedAt: Number(localRows[0].updated_at || 0),
      deletedAt:
        localRows[0].deleted_at === null || localRows[0].deleted_at === undefined
          ? null
          : Number(localRows[0].deleted_at),
    });

    const compareResult = this.compareConversationVersions(local, remoteRecord);
    if (compareResult > 0) {
      return { applied: false, stale: true };
    }
    if (compareResult === 0) {
      return { applied: false, stale: false };
    }

    const createdAt =
      Number.isFinite(local.createdAt) && local.createdAt > 0
        ? Math.min(local.createdAt, remoteRecord.createdAt || local.createdAt)
        : remoteRecord.createdAt;

    this.runMutation(
      `
      UPDATE conversations
      SET assistant_code = ?,
          conversation_name = ?,
          preview = ?,
          session_json = ?,
          size_bytes = ?,
          created_at = ?,
          updated_at = ?,
          deleted_at = ?
      WHERE id = ?;
      `,
      [
        remoteRecord.assistantCode,
        remoteRecord.conversationName,
        remoteRecord.preview,
        remoteRecord.sessionJson,
        remoteRecord.sizeBytes,
        createdAt,
        remoteRecord.updatedAt,
        remoteRecord.deletedAt,
        remoteRecord.id,
      ],
    );
    return { applied: true, stale: false };
  }

  async pullRemoteConversations() {
    const dsn = this.getConfiguredPostgresUrl();
    if (!dsn || !this.pgPool) {
      return { pulled: 0, applied: 0, staleSkipped: 0 };
    }

    const client = await this.pgPool.connect();
    const cursor = this.getConversationPullCursor(dsn);
    const nextCursor = {
      updatedAt: Number(cursor.updatedAt || 0),
      id: String(cursor.id || ''),
    };

    let pulled = 0;
    let applied = 0;
    let staleSkipped = 0;

    try {
      while (true) {
        const result = await client.query(
          `
          SELECT id, assistant_code, conversation_name, preview, session_json::text AS session_json_text,
                 size_bytes,
                 EXTRACT(EPOCH FROM created_at) * 1000 AS created_at_ms,
                 EXTRACT(EPOCH FROM updated_at) * 1000 AS updated_at_ms,
                 CASE
                   WHEN deleted_at IS NULL THEN NULL
                   ELSE EXTRACT(EPOCH FROM deleted_at) * 1000
                 END AS deleted_at_ms
          FROM app_conversations
          WHERE (
              updated_at > to_timestamp($1::double precision / 1000.0)
              OR (
                updated_at = to_timestamp($1::double precision / 1000.0)
                AND id > $2
              )
            )
          ORDER BY updated_at ASC, id ASC
          LIMIT $3;
          `,
          [nextCursor.updatedAt, nextCursor.id, this.syncBatchSize],
        );

        const rows = result?.rows || [];
        if (!rows.length) break;

        for (const row of rows) {
          const remoteRecord = this.normalizeConversationForSync({
            id: row.id,
            assistantCode: row.assistant_code,
            conversationName: row.conversation_name,
            preview: row.preview,
            sessionJson:
              typeof row.session_json_text === 'string' && row.session_json_text
                ? row.session_json_text
                : row.session_json,
            sizeBytes: Number(row.size_bytes || 0),
            createdAt: Number(row.created_at_ms || 0),
            updatedAt: Number(row.updated_at_ms || 0),
            deletedAt:
              row.deleted_at_ms === null || row.deleted_at_ms === undefined
                ? null
                : Number(row.deleted_at_ms),
          });
          if (!remoteRecord.id) continue;

          pulled += 1;
          const merged = this.applyRemoteConversation(remoteRecord);
          if (merged.applied) {
            applied += 1;
          } else if (merged.stale) {
            staleSkipped += 1;
          }

          nextCursor.updatedAt = remoteRecord.updatedAt;
          nextCursor.id = remoteRecord.id;
        }
      }
    } finally {
      client.release();
      this.setConversationPullCursor(dsn, nextCursor);
    }

    return { pulled, applied, staleSkipped };
  }

  scheduleSync(delayMs = 0) {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }

    this.syncTimer = setTimeout(
      () => {
        this.syncTimer = null;
        this.syncNow().catch((error) => {
          this.lastError = `Sync failed: ${String(error?.message || error)}`;
        });
      },
      Math.max(0, Number(delayMs) || 0),
    );
  }

  async syncNow() {
    await this.init();

    if (this.syncInFlight) {
      return { ok: true, skipped: true, reason: 'in-flight' };
    }

    const configured = !!this.getConfiguredPostgresUrl();
    if (!configured) {
      this.pgConnected = false;
      this.lastError = '';
      return { ok: true, skipped: true, reason: 'sqlite-only' };
    }

    this.syncInFlight = true;
    let pushed = 0;
    let pulled = 0;
    let applied = 0;
    let staleSkipped = 0;
    let failed = 0;

    try {
      const ready = await this.ensurePostgresReady();
      if (!ready || !this.pgPool) {
        this.scheduleSync(calcBackoffMs(1));
        const summary = {
          ok: false,
          pushed,
          pulled,
          applied,
          staleSkipped,
          processed: pushed,
          failed,
          error: this.lastError || 'Postgres unavailable',
        };
        this.emitSyncSummary(summary);
        return summary;
      }

      while (true) {
        const rows = this.runStatement(
          `
          SELECT seq, entity_type, entity_id, op, payload_json, attempts
          FROM outbox
          WHERE next_retry_at <= ?
          ORDER BY seq ASC
          LIMIT ?;
          `,
          [nowMs(), this.syncBatchSize],
        );

        if (!rows.length) break;

        for (const row of rows) {
          try {
            const result = await this.applyOutboxRow(row);
            this.runMutation('DELETE FROM outbox WHERE seq = ?;', [row.seq]);

            if (result?.stale) {
              staleSkipped += 1;
            } else if (result?.applied !== false) {
              pushed += 1;
            }
          } catch (error) {
            const attempts = Number(row.attempts || 0) + 1;
            const delay = calcBackoffMs(attempts);
            this.runMutation('UPDATE outbox SET attempts = ?, next_retry_at = ? WHERE seq = ?;', [
              attempts,
              nowMs() + delay,
              row.seq,
            ]);
            failed += 1;
            this.pgConnected = false;
            this.lastError = String(error?.message || error);

            if (
              /(ECONN|timeout|connect|closed|terminat|refused|network|socket)/i.test(this.lastError)
            ) {
              throw error;
            }
          }
        }

        if (failed > 0) {
          break;
        }
      }

      if (failed === 0) {
        const pullResult = await this.pullRemoteConversations();
        pulled = Number(pullResult?.pulled || 0);
        applied = Number(pullResult?.applied || 0);
        staleSkipped += Number(pullResult?.staleSkipped || 0);
      }

      this.pgConnected = true;
      if (failed === 0) {
        this.lastError = '';
      }
      this.lastSyncAt = nowMs();
      this.scheduleSync(this.syncPullIntervalMs);

      const summary = {
        ok: failed === 0,
        pushed,
        pulled,
        applied,
        staleSkipped,
        processed: pushed,
        failed,
        error: failed === 0 ? '' : this.lastError,
      };
      this.emitSyncSummary(summary);
      return summary;
    } catch (error) {
      this.pgConnected = false;
      this.lastError = String(error?.message || error);
      this.scheduleSync(calcBackoffMs(1));
      const summary = {
        ok: false,
        pushed,
        pulled,
        applied,
        staleSkipped,
        processed: pushed,
        failed,
        error: this.lastError,
      };
      this.emitSyncSummary(summary);
      return summary;
    } finally {
      this.syncInFlight = false;
    }
  }

  async applyOutboxRow(row) {
    const payload = safeJsonParse(row.payload_json, {});
    const client = await this.pgPool.connect();

    try {
      if (row.entity_type === 'doc') {
        if (row.op === 'delete') {
          await client.query('DELETE FROM app_docs WHERE id = $1;', [
            String(payload.id || row.entity_id),
          ]);
          return { applied: true, stale: false };
        }

        const updatedAt = Number(payload.updatedAt || nowMs());
        await client.query(
          `
          INSERT INTO app_docs (id, data_json, updated_at)
          VALUES ($1, $2::jsonb, to_timestamp($3::double precision / 1000.0))
          ON CONFLICT (id) DO UPDATE
          SET data_json = excluded.data_json,
              updated_at = excluded.updated_at;
          `,
          [String(payload.id || row.entity_id), JSON.stringify(payload.data ?? {}), updatedAt],
        );
        return { applied: true, stale: false };
      }

      if (row.entity_type === 'conversation') {
        const conversationId = String(payload.id || row.entity_id || '').trim();
        if (!conversationId) return { applied: false, stale: false };

        if (row.op === 'delete') {
          const deletedAt = Number(payload.deletedAt || nowMs());
          const remoteCurrent = await this.getRemoteConversationSnapshotById(
            client,
            conversationId,
          );
          if (!remoteCurrent) {
            return { applied: false, stale: false };
          }

          const localDeleteRecord = {
            id: conversationId,
            assistantCode: remoteCurrent.assistantCode,
            conversationName: remoteCurrent.conversationName,
            preview: remoteCurrent.preview,
            sessionJson: remoteCurrent.sessionJson,
            sizeBytes: remoteCurrent.sizeBytes,
            updatedAt: deletedAt,
            deletedAt,
          };
          const compareResult = this.compareConversationVersions(localDeleteRecord, remoteCurrent);
          if (compareResult < 0) {
            return { applied: false, stale: true };
          }
          if (
            compareResult === 0 &&
            Number(remoteCurrent.deletedAt || 0) ===
              (Number.isFinite(deletedAt) && deletedAt > 0 ? Math.floor(deletedAt) : 0)
          ) {
            return { applied: false, stale: false };
          }

          await client.query(
            `
            UPDATE app_conversations
            SET deleted_at = to_timestamp($2::double precision / 1000.0),
                updated_at = to_timestamp($2::double precision / 1000.0)
            WHERE id = $1;
            `,
            [conversationId, deletedAt],
          );
          return { applied: true, stale: false };
        }

        const localRecord = this.normalizeConversationForSync({
          id: conversationId,
          assistantCode: payload.assistantCode,
          conversationName: payload.conversationName,
          preview: payload.preview,
          sessionJson: payload.sessionJson,
          sessionData: payload.sessionData,
          sizeBytes: payload.sizeBytes,
          createdAt: payload.createdAt,
          updatedAt: payload.updatedAt,
          deletedAt: payload.deletedAt,
        });

        const remoteCurrent = await this.getRemoteConversationSnapshotById(client, conversationId);
        if (remoteCurrent) {
          const compareResult = this.compareConversationVersions(localRecord, remoteCurrent);
          if (compareResult < 0) {
            return { applied: false, stale: true };
          }
          if (compareResult === 0) {
            return { applied: false, stale: false };
          }
        }

        await client.query(
          `
          INSERT INTO app_conversations (
            id,
            assistant_code,
            conversation_name,
            preview,
            session_json,
            size_bytes,
            created_at,
            updated_at,
            deleted_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5::jsonb,
            $6,
            to_timestamp($7::double precision / 1000.0),
            to_timestamp($8::double precision / 1000.0),
            CASE WHEN $9::double precision IS NULL THEN NULL ELSE to_timestamp($9::double precision / 1000.0) END
          )
          ON CONFLICT (id) DO UPDATE
          SET assistant_code = excluded.assistant_code,
              conversation_name = excluded.conversation_name,
              preview = excluded.preview,
              session_json = excluded.session_json,
              size_bytes = excluded.size_bytes,
              created_at = excluded.created_at,
              updated_at = excluded.updated_at,
              deleted_at = excluded.deleted_at;
          `,
          [
            localRecord.id,
            localRecord.assistantCode,
            localRecord.conversationName,
            localRecord.preview,
            localRecord.sessionJson,
            localRecord.sizeBytes,
            localRecord.createdAt,
            localRecord.updatedAt,
            localRecord.deletedAt,
          ],
        );
        return { applied: true, stale: false };
      }

      return { applied: false, stale: false };
    } finally {
      client.release();
    }
  }

  docGetSync(id) {
    this.ensureReady();
    const rows = this.runStatement(
      'SELECT id, rev_no, rev_tag, data_json FROM docs WHERE id = ? LIMIT 1;',
      [String(id)],
    );
    if (!rows.length) return null;

    const row = rows[0];
    return {
      _id: row.id,
      _rev: buildRev(row.rev_no, row.rev_tag),
      data: safeJsonParse(row.data_json, {}),
    };
  }

  docPutSync(doc) {
    this.ensureReady();

    if (!doc || !doc._id) {
      return { ok: false, error: true, name: 'bad_request', message: 'Missing _id' };
    }

    const id = String(doc._id);
    const currentRows = this.runStatement(
      'SELECT rev_no, rev_tag FROM docs WHERE id = ? LIMIT 1;',
      [id],
    );
    const existing = currentRows[0] || null;

    const existingRev = existing ? buildRev(existing.rev_no, existing.rev_tag) : '';
    if (existing && doc._rev && String(doc._rev) !== existingRev) {
      return { ok: false, error: true, name: 'conflict', message: 'Document update conflict' };
    }

    const nextRevNo = existing ? Number(existing.rev_no || 0) + 1 : 1;
    const nextRevTag = randomTag();
    const nextRev = buildRev(nextRevNo, nextRevTag);
    const dataJson = JSON.stringify(deepClone(doc.data));
    const updatedAt = nowMs();

    this.runMutation(
      `
      INSERT INTO docs (id, rev_no, rev_tag, data_json, updated_at, scope)
      VALUES (?, ?, ?, ?, ?, '')
      ON CONFLICT(id) DO UPDATE SET
        rev_no = excluded.rev_no,
        rev_tag = excluded.rev_tag,
        data_json = excluded.data_json,
        updated_at = excluded.updated_at;
      `,
      [id, nextRevNo, nextRevTag, dataJson, updatedAt],
    );

    const docData = safeJsonParse(dataJson, {});
    this.enqueueOutbox('doc', id, 'upsert', {
      id,
      data: docData,
      updatedAt,
    });

    if (id === 'config') {
      this.updateConfiguredPostgresUrl(extractPostgresUrlFromConfigDoc(docData));
    }

    this.scheduleSync(100);

    return { ok: true, id, rev: nextRev };
  }

  docRemoveSync(id) {
    this.ensureReady();
    const key = String(id || '');
    if (!key) {
      return { ok: false, error: true, name: 'bad_request', message: 'Missing _id' };
    }

    const existing = this.runStatement('SELECT id FROM docs WHERE id = ? LIMIT 1;', [key]);
    if (!existing.length) {
      return { ok: false, error: true, name: 'not_found', message: `Document ${key} not found` };
    }

    this.runMutation('DELETE FROM docs WHERE id = ?;', [key]);
    this.enqueueOutbox('doc', key, 'delete', { id: key, deletedAt: nowMs() });

    if (key === 'config') {
      this.updateConfiguredPostgresUrl('');
    }

    this.scheduleSync(100);
    return { ok: true, id: key };
  }

  getAllDocsLegacy() {
    this.ensureReady();
    const rows = this.runStatement(
      'SELECT id, rev_no, rev_tag, data_json FROM docs ORDER BY id ASC;',
    );
    const result = {};
    rows.forEach((row) => {
      result[row.id] = {
        _id: row.id,
        _rev: buildRev(row.rev_no, row.rev_tag),
        data: safeJsonParse(row.data_json, {}),
      };
    });
    return result;
  }

  normalizeConversationPayload(payload = {}) {
    let sessionObject = payload.sessionData;
    if (!sessionObject && payload.session_json) {
      sessionObject = safeJsonParse(payload.session_json, null);
    }
    if (!sessionObject && payload.sessionJson) {
      sessionObject = safeJsonParse(payload.sessionJson, null);
    }
    if (!sessionObject && payload.session) {
      sessionObject = payload.session;
    }

    if (!sessionObject || typeof sessionObject !== 'object') {
      throw new Error('Session payload is required and must be an object.');
    }

    const conversationId = String(
      payload.conversationId || payload.id || sessionObject.conversationId || '',
    ).trim();
    const normalized = this.normalizeConversationForSync({
      ...payload,
      id: conversationId || crypto.randomUUID(),
      sessionData: sessionObject,
      sessionJson: JSON.stringify(sessionObject),
    });

    return {
      conversationId: normalized.id,
      assistantCode: normalized.assistantCode,
      conversationName: normalized.conversationName,
      preview: normalized.preview,
      sessionObject: normalized.sessionObject,
      sessionJson: normalized.sessionJson,
    };
  }

  upsertConversation(payload = {}) {
    this.ensureReady();
    const normalized = this.normalizeConversationPayload(payload);
    const currentRows = this.runStatement(
      `
      SELECT id, assistant_code, conversation_name, preview, session_json,
             size_bytes, created_at, updated_at, deleted_at
      FROM conversations
      WHERE id = ?
      LIMIT 1;
      `,
      [normalized.conversationId],
    );

    const existing = currentRows[0] || null;
    const createdAt = existing ? Number(existing.created_at || nowMs()) : nowMs();
    const updatedAt = nowMs();
    const sizeBytes = Buffer.byteLength(normalized.sessionJson, 'utf8');

    const unchanged =
      !!existing &&
      existing.deleted_at === null &&
      String(existing.assistant_code || '') === normalized.assistantCode &&
      String(existing.conversation_name || '') === normalized.conversationName &&
      String(existing.preview || '') === normalized.preview &&
      String(existing.session_json || '') === normalized.sessionJson;

    if (unchanged) {
      return {
        ok: true,
        unchanged: true,
        conversationId: normalized.conversationId,
        conversationName: normalized.conversationName,
        assistantCode: normalized.assistantCode,
        preview: normalized.preview,
        size: Number(existing.size_bytes || sizeBytes),
        lastmod: toIso(Number(existing.updated_at || updatedAt)),
      };
    }

    this.runMutation(
      `
      INSERT INTO conversations (
        id,
        assistant_code,
        conversation_name,
        preview,
        session_json,
        size_bytes,
        created_at,
        updated_at,
        deleted_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(id) DO UPDATE SET
        assistant_code = excluded.assistant_code,
        conversation_name = excluded.conversation_name,
        preview = excluded.preview,
        session_json = excluded.session_json,
        size_bytes = excluded.size_bytes,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        deleted_at = NULL;
      `,
      [
        normalized.conversationId,
        normalized.assistantCode,
        normalized.conversationName,
        normalized.preview,
        normalized.sessionJson,
        sizeBytes,
        createdAt,
        updatedAt,
      ],
    );

    this.enqueueOutbox('conversation', normalized.conversationId, 'upsert', {
      id: normalized.conversationId,
      assistantCode: normalized.assistantCode,
      conversationName: normalized.conversationName,
      preview: normalized.preview,
      sessionJson: normalized.sessionJson,
      sizeBytes,
      createdAt,
      updatedAt,
      deletedAt: null,
    });

    this.scheduleSync(80);

    return {
      ok: true,
      unchanged: false,
      conversationId: normalized.conversationId,
      conversationName: normalized.conversationName,
      assistantCode: normalized.assistantCode,
      preview: normalized.preview,
      size: sizeBytes,
      lastmod: toIso(updatedAt),
    };
  }

  listConversations(filter = {}) {
    this.ensureReady();
    const clauses = [];
    const params = [];

    const includeDeleted = filter.includeDeleted === true;
    if (!includeDeleted) {
      clauses.push('deleted_at IS NULL');
    }

    if (filter.assistantCode) {
      clauses.push('assistant_code = ?');
      params.push(String(filter.assistantCode));
    }

    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const limitRaw = Number(filter.limit || 0);
    const limitSql =
      Number.isFinite(limitRaw) && limitRaw > 0 ? `LIMIT ${Math.floor(limitRaw)}` : '';

    const rows = this.runStatement(
      `
      SELECT id, assistant_code, conversation_name, preview, size_bytes, created_at, updated_at, deleted_at
      FROM conversations
      ${whereSql}
      ORDER BY updated_at DESC
      ${limitSql};
      `,
      params,
    );

    return rows.map((row) => ({
      conversationId: row.id,
      assistantCode: row.assistant_code,
      conversationName: row.conversation_name,
      preview: row.preview || '',
      size: Number(row.size_bytes || 0),
      createdAt: toIso(Number(row.created_at || 0)),
      updatedAt: toIso(Number(row.updated_at || 0)),
      lastmod: toIso(Number(row.updated_at || 0)),
      deletedAt:
        row.deleted_at === null || row.deleted_at === undefined
          ? null
          : toIso(Number(row.deleted_at || 0)),
    }));
  }

  getConversation(conversationId) {
    this.ensureReady();
    const id = String(conversationId || '').trim();
    if (!id) return null;

    const rows = this.runStatement(
      `
      SELECT id, assistant_code, conversation_name, preview, session_json,
             size_bytes, created_at, updated_at, deleted_at
      FROM conversations
      WHERE id = ?
      LIMIT 1;
      `,
      [id],
    );

    if (!rows.length) return null;
    const row = rows[0];
    const normalized = this.normalizeConversationForSync({
      id: row.id,
      assistantCode: row.assistant_code,
      conversationName: row.conversation_name,
      preview: row.preview,
      sessionJson: row.session_json,
      sizeBytes: Number(row.size_bytes || 0),
      createdAt: Number(row.created_at || 0),
      updatedAt: Number(row.updated_at || 0),
      deletedAt:
        row.deleted_at === null || row.deleted_at === undefined ? null : Number(row.deleted_at),
    });

    return {
      conversationId: normalized.id,
      assistantCode: normalized.assistantCode,
      conversationName: normalized.conversationName,
      preview: normalized.preview,
      size: normalized.sizeBytes,
      createdAt: toIso(Number(row.created_at || 0)),
      updatedAt: toIso(Number(row.updated_at || 0)),
      lastmod: toIso(Number(row.updated_at || 0)),
      deletedAt:
        row.deleted_at === null || row.deleted_at === undefined
          ? null
          : toIso(Number(row.deleted_at || 0)),
      sessionData: normalized.sessionObject,
    };
  }

  renameConversation(conversationId, conversationName) {
    this.ensureReady();
    const id = String(conversationId || '').trim();
    const name = String(conversationName || '').trim();
    if (!id) {
      throw new Error('conversationId is required');
    }
    if (!name) {
      throw new Error('conversationName is required');
    }

    const currentRows = this.runStatement(
      `
      SELECT id, assistant_code, conversation_name, preview, session_json,
             size_bytes, created_at, updated_at, deleted_at
      FROM conversations
      WHERE id = ?
      LIMIT 1;
      `,
      [id],
    );
    if (!currentRows.length) {
      throw new Error('Conversation not found.');
    }
    const current = this.normalizeConversationForSync({
      id: currentRows[0].id,
      assistantCode: currentRows[0].assistant_code,
      conversationName: name,
      preview: currentRows[0].preview,
      sessionJson: currentRows[0].session_json,
      sizeBytes: Number(currentRows[0].size_bytes || 0),
      createdAt: Number(currentRows[0].created_at || 0),
      updatedAt: Number(currentRows[0].updated_at || 0),
      deletedAt:
        currentRows[0].deleted_at === null || currentRows[0].deleted_at === undefined
          ? null
          : Number(currentRows[0].deleted_at),
    });

    const updatedAt = nowMs();
    const sizeBytes = Buffer.byteLength(current.sessionJson, 'utf8');
    this.runMutation(
      `
      UPDATE conversations
      SET conversation_name = ?,
          preview = ?,
          session_json = ?,
          size_bytes = ?,
          updated_at = ?,
          deleted_at = NULL
      WHERE id = ?;
      `,
      [current.conversationName, current.preview, current.sessionJson, sizeBytes, updatedAt, id],
    );

    this.enqueueOutbox('conversation', id, 'upsert', {
      id,
      assistantCode: current.assistantCode,
      conversationName: current.conversationName,
      preview: current.preview,
      sessionJson: current.sessionJson,
      sizeBytes,
      createdAt: current.createdAt,
      updatedAt,
      deletedAt: null,
    });

    this.scheduleSync(60);
    return {
      ok: true,
      conversationId: id,
      conversationName: name,
      updatedAt: toIso(updatedAt),
    };
  }

  deleteConversations(ids = []) {
    this.ensureReady();
    const normalized = Array.isArray(ids)
      ? ids.map((id) => String(id || '').trim()).filter(Boolean)
      : [];

    if (!normalized.length) {
      return { ok: true, deletedCount: 0 };
    }

    const deletedAt = nowMs();

    const placeholders = normalized.map(() => '?').join(', ');
    this.runMutation(
      `
      UPDATE conversations
      SET deleted_at = ?, updated_at = ?
      WHERE id IN (${placeholders});
      `,
      [deletedAt, deletedAt, ...normalized],
    );

    normalized.forEach((id) => {
      this.enqueueOutbox('conversation', id, 'delete', {
        id,
        deletedAt,
      });
    });

    this.scheduleSync(60);
    return {
      ok: true,
      deletedCount: normalized.length,
    };
  }

  cleanConversations(days = 30) {
    this.ensureReady();
    const numDays = Number(days);
    if (!Number.isFinite(numDays) || numDays < 1) {
      throw new Error('days must be a positive number.');
    }

    const cutoff = nowMs() - Math.floor(numDays * 24 * 60 * 60 * 1000);
    const rows = this.runStatement(
      `
      SELECT id
      FROM conversations
      WHERE deleted_at IS NULL AND updated_at < ?
      ORDER BY updated_at ASC;
      `,
      [cutoff],
    );

    const ids = rows.map((row) => String(row.id));
    if (!ids.length) {
      return { ok: true, deletedCount: 0, ids: [] };
    }

    this.deleteConversations(ids);
    return {
      ok: true,
      deletedCount: ids.length,
      ids,
    };
  }

  async runLegacyMigrations() {
    if (this.getMeta('legacy_docs_migrated') !== 'true') {
      await this.migrateLegacyDocs();
      this.setMeta('legacy_docs_migrated', 'true');
    }

    if (this.getMeta('legacy_sessions_migrated') !== 'true') {
      await this.migrateLegacySessions();
      this.setMeta('legacy_sessions_migrated', 'true');
    }
  }

  async migrateLegacyDocs() {
    const sourcePath = String(this.legacyDocsPath || '').trim();
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      return;
    }

    let payload;
    try {
      const raw = await fsp.readFile(sourcePath, 'utf8');
      payload = raw ? JSON.parse(raw) : {};
    } catch (_error) {
      payload = {};
    }

    if (!payload || typeof payload !== 'object') {
      return;
    }

    this.withTransaction(() => {
      Object.entries(payload).forEach(([id, doc]) => {
        if (!id || !doc || typeof doc !== 'object') return;
        const data = deepClone(doc.data || {});
        const parsed = parseRev(doc._rev);
        const revNo = parsed.revNo > 0 ? parsed.revNo : 1;
        const revTag = parsed.revTag || randomTag();

        this.runMutation(
          `
          INSERT OR REPLACE INTO docs (id, rev_no, rev_tag, data_json, updated_at, scope)
          VALUES (?, ?, ?, ?, ?, '');
          `,
          [id, revNo, revTag, JSON.stringify(data), nowMs()],
        );
      });
    });

    const configDoc = this.docGetSync('config');
    if (configDoc?.data) {
      this.updateConfiguredPostgresUrl(extractPostgresUrlFromConfigDoc(configDoc.data));
    }
  }

  resolveLegacyChatPath() {
    // 优先取 local config 文档
    const localRows = this.runStatement(
      "SELECT data_json FROM docs WHERE id LIKE 'config_local_%' ORDER BY id ASC;",
    );

    for (const row of localRows) {
      const data = safeJsonParse(row.data_json, {});
      const localPath = String(data?.localChatPath || '').trim();
      if (localPath) return localPath;
    }

    const configDoc = this.docGetSync('config');
    const fallbackPath = String(configDoc?.data?.config?.webdav?.localChatPath || '').trim();
    if (fallbackPath) return fallbackPath;

    return '';
  }

  async migrateLegacySessions() {
    const localPath = this.resolveLegacyChatPath();
    if (!localPath) return;

    try {
      const stat = await fsp.stat(localPath);
      if (!stat.isDirectory()) return;
    } catch (_error) {
      return;
    }

    let files = [];
    try {
      files = await fsp.readdir(localPath);
    } catch (_error) {
      return;
    }

    for (const fileName of files) {
      if (!String(fileName).toLowerCase().endsWith('.json')) continue;

      const filePath = path.join(localPath, fileName);
      let raw = '';
      let stat = null;
      try {
        raw = await fsp.readFile(filePath, 'utf8');
        stat = await fsp.stat(filePath);
      } catch (_error) {
        continue;
      }

      const sessionObject = safeJsonParse(raw, null);
      if (!isSessionPayload(sessionObject)) continue;

      const assistantCode = String(sessionObject?.CODE || 'AI');
      const conversationName = fileName.replace(/\.json$/i, '') || `Legacy-${assistantCode}`;
      const preview = extractConversationPreview(sessionObject);
      const conversationId = `legacy:${stableHash(filePath)}`;
      const createdAt = Number(stat?.birthtimeMs || stat?.mtimeMs || nowMs());
      const updatedAt = Number(stat?.mtimeMs || nowMs());
      const sizeBytes = Buffer.byteLength(raw, 'utf8');

      const exists = this.getConversation(conversationId);
      if (exists) continue;

      this.runMutation(
        `
        INSERT OR REPLACE INTO conversations (
          id, assistant_code, conversation_name, preview,
          session_json, size_bytes, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL);
        `,
        [
          conversationId,
          assistantCode,
          conversationName,
          preview,
          raw,
          sizeBytes,
          createdAt,
          updatedAt,
        ],
      );
    }
  }
}

module.exports = {
  StorageService,
  testPostgresConnection,
  maskPostgresUrl,
  normalizePostgresUrl,
};

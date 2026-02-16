"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// apps/backend/src/storage_service.ts
var require_storage_service = __commonJS({
  "apps/backend/src/storage_service.ts"(exports2, module2) {
    "use strict";
    var crypto = require("crypto");
    var fs2 = require("fs");
    var fsp = require("fs/promises");
    var path2 = require("path");
    var { Client, Pool } = require("pg");
    var DEFAULT_SQLITE_FILENAME = "cache.sqlite";
    var DEFAULT_FLUSH_DEBOUNCE_MS = 800;
    var DEFAULT_SYNC_BATCH_SIZE = 50;
    var DEFAULT_SYNC_BACKOFF_BASE_MS = 1e3;
    var DEFAULT_SYNC_BACKOFF_MAX_MS = 6e4;
    function nowMs() {
      return Date.now();
    }
    function toIso(ms) {
      if (!ms || !Number.isFinite(ms)) return "";
      return new Date(ms).toISOString();
    }
    function deepClone(value) {
      if (value === void 0 || value === null) return value;
      return JSON.parse(JSON.stringify(value));
    }
    function stableHash(raw) {
      return crypto.createHash("sha1").update(String(raw || "")).digest("hex");
    }
    function safeJsonParse(text, fallback = null) {
      if (typeof text !== "string" || !text.trim()) return fallback;
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
      const source = String(rev || "").trim();
      if (!source) {
        return { revNo: 0, revTag: "" };
      }
      const [rawNo, rawTag] = source.split("-");
      const revNo = Number(rawNo);
      return {
        revNo: Number.isFinite(revNo) ? revNo : 0,
        revTag: rawTag || ""
      };
    }
    function buildRev(revNo, revTag) {
      return `${Number(revNo || 0)}-${String(revTag || "").trim() || randomTag()}`;
    }
    function randomTag() {
      return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    }
    function normalizePostgresUrl(raw) {
      return String(raw || "").trim();
    }
    function extractConversationPreview(sessionObject) {
      const messages = Array.isArray(sessionObject?.chat_show) ? sessionObject.chat_show : Array.isArray(sessionObject?.history) ? sessionObject.history : [];
      const candidate = messages.find((msg) => msg?.role === "user" || msg?.role === "assistant");
      if (!candidate) return "";
      const content = candidate.content;
      if (typeof content === "string") {
        return content.slice(0, 120).trim();
      }
      if (Array.isArray(content)) {
        const textParts = content.filter((part) => part && part.type === "text" && typeof part.text === "string").map((part) => part.text.trim()).filter(Boolean);
        return textParts.join(" ").slice(0, 120).trim();
      }
      return "";
    }
    function isSessionPayload(sessionObject) {
      if (!sessionObject || typeof sessionObject !== "object") return false;
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
      if (!source) return "";
      try {
        const parsed = new URL(source);
        const host = parsed.hostname || "unknown";
        const port = parsed.port ? `:${parsed.port}` : "";
        const dbName = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname.slice(1) : "";
        return dbName ? `${host}${port}/${dbName}` : `${host}${port}`;
      } catch (_error) {
        const atIndex = source.lastIndexOf("@");
        if (atIndex >= 0 && atIndex < source.length - 1) {
          return source.slice(atIndex + 1);
        }
        return "configured";
      }
    }
    async function testPostgresConnection2(connectionString) {
      const dsn = normalizePostgresUrl(connectionString);
      if (!dsn) {
        return {
          ok: false,
          error: "Postgres connection string is empty."
        };
      }
      const client = new Client({
        connectionString: dsn,
        connectionTimeoutMillis: 5e3,
        statement_timeout: 5e3
      });
      try {
        await client.connect();
        await client.query("SELECT 1");
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error: String(error?.message || error)
        };
      } finally {
        try {
          await client.end();
        } catch (_endError) {
        }
      }
    }
    var StorageService2 = class {
      constructor(options = {}) {
        this.dataRoot = options.dataRoot;
        this.legacyDocsPath = options.legacyDocsPath || "";
        this.sqliteFilename = options.sqliteFilename || DEFAULT_SQLITE_FILENAME;
        this.flushDebounceMs = Number.isFinite(options.flushDebounceMs) && options.flushDebounceMs > 0 ? Number(options.flushDebounceMs) : DEFAULT_FLUSH_DEBOUNCE_MS;
        this.syncBatchSize = Number.isFinite(options.syncBatchSize) && options.syncBatchSize > 0 ? Number(options.syncBatchSize) : DEFAULT_SYNC_BATCH_SIZE;
        this.sqlitePath = path2.join(this.dataRoot, this.sqliteFilename);
        this.SQL = null;
        this.db = null;
        this.initialized = false;
        this.initPromise = null;
        this.flushTimer = null;
        this.syncTimer = null;
        this.flushInProgress = false;
        this.syncInFlight = false;
        this.pgPool = null;
        this.pgDsn = "";
        this.pgConnected = false;
        this.lastError = "";
        this.lastSyncAt = 0;
      }
      isReady() {
        return this.initialized && !!this.db;
      }
      getMode() {
        const configured = !!this.getConfiguredPostgresUrl();
        if (!configured) return "sqlite-only";
        return this.pgConnected ? "hybrid-online" : "hybrid-offline";
      }
      async init() {
        if (this.initialized && this.db) return this;
        if (this.initPromise) return this.initPromise;
        this.initPromise = this._initInternal().then(() => {
          this.initialized = true;
          this.initPromise = null;
          return this;
        }).catch((error) => {
          this.initPromise = null;
          throw error;
        });
        return this.initPromise;
      }
      async _initInternal() {
        if (!this.dataRoot) {
          throw new Error("StorageService requires dataRoot.");
        }
        await fsp.mkdir(this.dataRoot, { recursive: true });
        const initSqlJsRaw = require("sql.js/dist/sql-wasm.js");
        const initSqlJs = typeof initSqlJsRaw === "function" ? initSqlJsRaw : initSqlJsRaw.default || initSqlJsRaw;
        const wasmBinary = fs2.readFileSync(require.resolve("sql.js/dist/sql-wasm.wasm"));
        this.SQL = await initSqlJs({ wasmBinary });
        if (fs2.existsSync(this.sqlitePath)) {
          const fileBuffer = fs2.readFileSync(this.sqlitePath);
          this.db = new this.SQL.Database(fileBuffer);
        } else {
          this.db = new this.SQL.Database();
        }
        this.execMany([
          "PRAGMA journal_mode = WAL;",
          "PRAGMA synchronous = NORMAL;",
          "PRAGMA temp_store = MEMORY;",
          "PRAGMA foreign_keys = ON;",
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
          "CREATE INDEX IF NOT EXISTS idx_conversations_assistant_updated ON conversations (assistant_code, updated_at DESC);",
          "CREATE INDEX IF NOT EXISTS idx_conversations_deleted_updated ON conversations (deleted_at, updated_at DESC);",
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
          "CREATE INDEX IF NOT EXISTS idx_outbox_retry_seq ON outbox (next_retry_at, seq);",
          `
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      `
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
          }
          this.pgPool = null;
        }
        if (this.db) {
          try {
            this.db.close();
          } catch (_error) {
          }
          this.db = null;
        }
        this.initialized = false;
      }
      ensureReady() {
        if (!this.db) {
          throw new Error("StorageService is not initialized.");
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
        this.db.exec("BEGIN IMMEDIATE TRANSACTION;");
        try {
          const result = fn();
          this.db.exec("COMMIT;");
          this.scheduleFlush();
          return result;
        } catch (error) {
          this.db.exec("ROLLBACK;");
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
        const rows = this.runStatement("SELECT value FROM meta WHERE key = ? LIMIT 1;", [String(key)]);
        if (!rows.length) return "";
        return String(rows[0].value || "");
      }
      setMeta(key, value) {
        const now = String(value ?? "");
        this.runMutation(
          `
      INSERT INTO meta (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
      `,
          [String(key), now]
        );
      }
      getConfiguredPostgresUrl() {
        const explicit = normalizePostgresUrl(this.pgDsn);
        if (explicit) return explicit;
        const configDoc = this.docGetSync("config");
        if (!configDoc || !configDoc.data) return "";
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
          pool.end().catch(() => {
          });
        }
        if (!normalized) {
          this.lastError = "";
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
          idleTimeoutMillis: 3e4,
          connectionTimeoutMillis: 5e3,
          statement_timeout: 1e4
        });
        try {
          const client = await pool.connect();
          try {
            await client.query("SELECT 1");
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
              "CREATE INDEX IF NOT EXISTS idx_app_conversations_assistant_updated ON app_conversations (assistant_code, updated_at DESC);"
            );
          } finally {
            client.release();
          }
          if (this.pgPool && this.pgPool !== pool) {
            this.pgPool.end().catch(() => {
            });
          }
          this.pgPool = pool;
          this.pgDsn = dsn;
          this.pgConnected = true;
          this.lastError = "";
          await this.seedOutboxForSnapshotIfNeeded(dsn);
          return true;
        } catch (error) {
          try {
            await pool.end();
          } catch (_endError) {
          }
          this.pgConnected = false;
          this.lastError = `Postgres connection failed: ${String(error?.message || error)}`;
          return false;
        }
      }
      async seedOutboxForSnapshotIfNeeded(dsn) {
        const fingerprint = stableHash(dsn).slice(0, 12);
        const metaKey = `pg_seeded_${fingerprint}`;
        if (this.getMeta(metaKey) === "true") return;
        const docs = this.runStatement("SELECT id, data_json, updated_at FROM docs;");
        docs.forEach((row) => {
          this.enqueueOutbox("doc", row.id, "upsert", {
            id: row.id,
            data: safeJsonParse(row.data_json, {}),
            updatedAt: Number(row.updated_at || nowMs())
          });
        });
        const conversations = this.runStatement(
          `
      SELECT id, assistant_code, conversation_name, preview, session_json,
             size_bytes, created_at, updated_at, deleted_at
      FROM conversations;
      `
        );
        conversations.forEach((row) => {
          this.enqueueOutbox("conversation", row.id, "upsert", {
            id: row.id,
            assistantCode: row.assistant_code,
            conversationName: row.conversation_name,
            preview: row.preview || "",
            sessionJson: row.session_json,
            sizeBytes: Number(row.size_bytes || 0),
            createdAt: Number(row.created_at || nowMs()),
            updatedAt: Number(row.updated_at || nowMs()),
            deletedAt: row.deleted_at === null || row.deleted_at === void 0 ? null : Number(row.deleted_at)
          });
        });
        this.setMeta(metaKey, "true");
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
          [
            String(entityType),
            String(entityId),
            String(op),
            JSON.stringify(payload ?? {}),
            nowMs()
          ]
        );
      }
      getOutboxQueueSize() {
        const rows = this.runStatement("SELECT COUNT(*) AS count FROM outbox;");
        return Number(rows[0]?.count || 0);
      }
      getStorageHealth() {
        const dsn = this.getConfiguredPostgresUrl();
        const configured = !!dsn;
        return {
          mode: this.getMode(),
          postgresConfigured: configured,
          postgresConnected: configured ? this.pgConnected : false,
          postgresTarget: configured ? maskPostgresUrl(dsn) : "",
          queueSize: this.getOutboxQueueSize(),
          lastSyncAt: this.lastSyncAt ? toIso(this.lastSyncAt) : "",
          lastError: this.lastError || ""
        };
      }
      scheduleSync(delayMs = 0) {
        if (this.syncTimer) {
          clearTimeout(this.syncTimer);
          this.syncTimer = null;
        }
        this.syncTimer = setTimeout(() => {
          this.syncTimer = null;
          this.syncNow().catch((error) => {
            this.lastError = `Sync failed: ${String(error?.message || error)}`;
          });
        }, Math.max(0, Number(delayMs) || 0));
      }
      async syncNow() {
        await this.init();
        if (this.syncInFlight) {
          return { ok: true, skipped: true, reason: "in-flight" };
        }
        const configured = !!this.getConfiguredPostgresUrl();
        if (!configured) {
          this.pgConnected = false;
          this.lastError = "";
          return { ok: true, skipped: true, reason: "sqlite-only" };
        }
        this.syncInFlight = true;
        let processed = 0;
        let failed = 0;
        try {
          const ready = await this.ensurePostgresReady();
          if (!ready || !this.pgPool) {
            return { ok: false, processed, failed, error: this.lastError || "Postgres unavailable" };
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
              [nowMs(), this.syncBatchSize]
            );
            if (!rows.length) break;
            for (const row of rows) {
              try {
                await this.applyOutboxRow(row);
                this.runMutation("DELETE FROM outbox WHERE seq = ?;", [row.seq]);
                processed += 1;
              } catch (error) {
                const attempts = Number(row.attempts || 0) + 1;
                const delay2 = calcBackoffMs(attempts);
                this.runMutation(
                  "UPDATE outbox SET attempts = ?, next_retry_at = ? WHERE seq = ?;",
                  [attempts, nowMs() + delay2, row.seq]
                );
                failed += 1;
                this.pgConnected = false;
                this.lastError = String(error?.message || error);
                if (/(ECONN|timeout|connect|closed|terminat|refused|network|socket)/i.test(this.lastError)) {
                  throw error;
                }
              }
            }
            if (failed > 0) {
              break;
            }
          }
          this.pgConnected = true;
          if (failed === 0) {
            this.lastError = "";
          }
          this.lastSyncAt = nowMs();
          return { ok: failed === 0, processed, failed, error: failed === 0 ? "" : this.lastError };
        } catch (error) {
          this.pgConnected = false;
          this.lastError = String(error?.message || error);
          this.scheduleSync(calcBackoffMs(1));
          return { ok: false, processed, failed, error: this.lastError };
        } finally {
          this.syncInFlight = false;
        }
      }
      async applyOutboxRow(row) {
        const payload = safeJsonParse(row.payload_json, {});
        const client = await this.pgPool.connect();
        try {
          if (row.entity_type === "doc") {
            if (row.op === "delete") {
              await client.query("DELETE FROM app_docs WHERE id = $1;", [String(payload.id || row.entity_id)]);
              return;
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
              [
                String(payload.id || row.entity_id),
                JSON.stringify(payload.data ?? {}),
                updatedAt
              ]
            );
            return;
          }
          if (row.entity_type === "conversation") {
            if (row.op === "delete") {
              const deletedAt2 = Number(payload.deletedAt || nowMs());
              await client.query(
                `
            UPDATE app_conversations
            SET deleted_at = to_timestamp($2::double precision / 1000.0),
                updated_at = to_timestamp($2::double precision / 1000.0)
            WHERE id = $1;
            `,
                [String(payload.id || row.entity_id), deletedAt2]
              );
              return;
            }
            const createdAt = Number(payload.createdAt || nowMs());
            const updatedAt = Number(payload.updatedAt || nowMs());
            const deletedAt = payload.deletedAt === null || payload.deletedAt === void 0 ? null : Number(payload.deletedAt);
            const sessionObject = typeof payload.sessionJson === "string" ? safeJsonParse(payload.sessionJson, {}) : payload.sessionData || payload.sessionJson || {};
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
                String(payload.id || row.entity_id),
                String(payload.assistantCode || "AI"),
                String(payload.conversationName || ""),
                String(payload.preview || ""),
                JSON.stringify(sessionObject || {}),
                Number(payload.sizeBytes || 0),
                createdAt,
                updatedAt,
                deletedAt
              ]
            );
          }
        } finally {
          client.release();
        }
      }
      docGetSync(id) {
        this.ensureReady();
        const rows = this.runStatement(
          "SELECT id, rev_no, rev_tag, data_json FROM docs WHERE id = ? LIMIT 1;",
          [String(id)]
        );
        if (!rows.length) return null;
        const row = rows[0];
        return {
          _id: row.id,
          _rev: buildRev(row.rev_no, row.rev_tag),
          data: safeJsonParse(row.data_json, {})
        };
      }
      docPutSync(doc) {
        this.ensureReady();
        if (!doc || !doc._id) {
          return { ok: false, error: true, name: "bad_request", message: "Missing _id" };
        }
        const id = String(doc._id);
        const currentRows = this.runStatement(
          "SELECT rev_no, rev_tag FROM docs WHERE id = ? LIMIT 1;",
          [id]
        );
        const existing = currentRows[0] || null;
        const existingRev = existing ? buildRev(existing.rev_no, existing.rev_tag) : "";
        if (existing && doc._rev && String(doc._rev) !== existingRev) {
          return { ok: false, error: true, name: "conflict", message: "Document update conflict" };
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
          [id, nextRevNo, nextRevTag, dataJson, updatedAt]
        );
        const docData = safeJsonParse(dataJson, {});
        this.enqueueOutbox("doc", id, "upsert", {
          id,
          data: docData,
          updatedAt
        });
        if (id === "config") {
          this.updateConfiguredPostgresUrl(extractPostgresUrlFromConfigDoc(docData));
        }
        this.scheduleSync(100);
        return { ok: true, id, rev: nextRev };
      }
      docRemoveSync(id) {
        this.ensureReady();
        const key = String(id || "");
        if (!key) {
          return { ok: false, error: true, name: "bad_request", message: "Missing _id" };
        }
        const existing = this.runStatement("SELECT id FROM docs WHERE id = ? LIMIT 1;", [key]);
        if (!existing.length) {
          return { ok: false, error: true, name: "not_found", message: `Document ${key} not found` };
        }
        this.runMutation("DELETE FROM docs WHERE id = ?;", [key]);
        this.enqueueOutbox("doc", key, "delete", { id: key, deletedAt: nowMs() });
        if (key === "config") {
          this.updateConfiguredPostgresUrl("");
        }
        this.scheduleSync(100);
        return { ok: true, id: key };
      }
      getAllDocsLegacy() {
        this.ensureReady();
        const rows = this.runStatement(
          "SELECT id, rev_no, rev_tag, data_json FROM docs ORDER BY id ASC;"
        );
        const result = {};
        rows.forEach((row) => {
          result[row.id] = {
            _id: row.id,
            _rev: buildRev(row.rev_no, row.rev_tag),
            data: safeJsonParse(row.data_json, {})
          };
        });
        return result;
      }
      normalizeConversationPayload(payload = {}) {
        const conversationId = String(payload.conversationId || payload.id || "").trim();
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
        if (!sessionObject || typeof sessionObject !== "object") {
          throw new Error("Session payload is required and must be an object.");
        }
        const sessionJson = JSON.stringify(sessionObject);
        const assistantCode = String(payload.assistantCode || payload.CODE || sessionObject.CODE || "AI");
        const conversationName = String(
          payload.conversationName || payload.name || sessionObject.conversationName || `Session-${assistantCode}-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}`
        ).trim();
        if (!conversationName) {
          throw new Error("conversationName is required.");
        }
        const preview = String(payload.preview || extractConversationPreview(sessionObject) || "").trim();
        return {
          conversationId: conversationId || crypto.randomUUID(),
          assistantCode,
          conversationName,
          preview,
          sessionObject,
          sessionJson
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
          [normalized.conversationId]
        );
        const existing = currentRows[0] || null;
        const createdAt = existing ? Number(existing.created_at || nowMs()) : nowMs();
        const updatedAt = nowMs();
        const sizeBytes = Buffer.byteLength(normalized.sessionJson, "utf8");
        const unchanged = !!existing && existing.deleted_at === null && String(existing.assistant_code || "") === normalized.assistantCode && String(existing.conversation_name || "") === normalized.conversationName && String(existing.preview || "") === normalized.preview && String(existing.session_json || "") === normalized.sessionJson;
        if (unchanged) {
          return {
            ok: true,
            unchanged: true,
            conversationId: normalized.conversationId,
            conversationName: normalized.conversationName,
            assistantCode: normalized.assistantCode,
            preview: normalized.preview,
            size: Number(existing.size_bytes || sizeBytes),
            lastmod: toIso(Number(existing.updated_at || updatedAt))
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
            updatedAt
          ]
        );
        this.enqueueOutbox("conversation", normalized.conversationId, "upsert", {
          id: normalized.conversationId,
          assistantCode: normalized.assistantCode,
          conversationName: normalized.conversationName,
          preview: normalized.preview,
          sessionJson: normalized.sessionJson,
          sizeBytes,
          createdAt,
          updatedAt,
          deletedAt: null
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
          lastmod: toIso(updatedAt)
        };
      }
      listConversations(filter = {}) {
        this.ensureReady();
        const clauses = [];
        const params = [];
        const includeDeleted = filter.includeDeleted === true;
        if (!includeDeleted) {
          clauses.push("deleted_at IS NULL");
        }
        if (filter.assistantCode) {
          clauses.push("assistant_code = ?");
          params.push(String(filter.assistantCode));
        }
        const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
        const limitRaw = Number(filter.limit || 0);
        const limitSql = Number.isFinite(limitRaw) && limitRaw > 0 ? `LIMIT ${Math.floor(limitRaw)}` : "";
        const rows = this.runStatement(
          `
      SELECT id, assistant_code, conversation_name, preview, size_bytes, created_at, updated_at, deleted_at
      FROM conversations
      ${whereSql}
      ORDER BY updated_at DESC
      ${limitSql};
      `,
          params
        );
        return rows.map((row) => ({
          conversationId: row.id,
          assistantCode: row.assistant_code,
          conversationName: row.conversation_name,
          preview: row.preview || "",
          size: Number(row.size_bytes || 0),
          createdAt: toIso(Number(row.created_at || 0)),
          updatedAt: toIso(Number(row.updated_at || 0)),
          lastmod: toIso(Number(row.updated_at || 0)),
          deletedAt: row.deleted_at === null || row.deleted_at === void 0 ? null : toIso(Number(row.deleted_at || 0))
        }));
      }
      getConversation(conversationId) {
        this.ensureReady();
        const id = String(conversationId || "").trim();
        if (!id) return null;
        const rows = this.runStatement(
          `
      SELECT id, assistant_code, conversation_name, preview, session_json,
             size_bytes, created_at, updated_at, deleted_at
      FROM conversations
      WHERE id = ?
      LIMIT 1;
      `,
          [id]
        );
        if (!rows.length) return null;
        const row = rows[0];
        return {
          conversationId: row.id,
          assistantCode: row.assistant_code,
          conversationName: row.conversation_name,
          preview: row.preview || "",
          size: Number(row.size_bytes || 0),
          createdAt: toIso(Number(row.created_at || 0)),
          updatedAt: toIso(Number(row.updated_at || 0)),
          lastmod: toIso(Number(row.updated_at || 0)),
          deletedAt: row.deleted_at === null || row.deleted_at === void 0 ? null : toIso(Number(row.deleted_at || 0)),
          sessionData: safeJsonParse(row.session_json, null)
        };
      }
      renameConversation(conversationId, conversationName) {
        this.ensureReady();
        const id = String(conversationId || "").trim();
        const name = String(conversationName || "").trim();
        if (!id) {
          throw new Error("conversationId is required");
        }
        if (!name) {
          throw new Error("conversationName is required");
        }
        const current = this.getConversation(id);
        if (!current) {
          throw new Error("Conversation not found.");
        }
        const updatedAt = nowMs();
        this.runMutation(
          "UPDATE conversations SET conversation_name = ?, updated_at = ?, deleted_at = NULL WHERE id = ?;",
          [name, updatedAt, id]
        );
        const refreshed = this.getConversation(id);
        this.enqueueOutbox("conversation", id, "upsert", {
          id,
          assistantCode: refreshed.assistantCode,
          conversationName: refreshed.conversationName,
          preview: refreshed.preview,
          sessionJson: JSON.stringify(refreshed.sessionData || {}),
          sizeBytes: refreshed.size,
          createdAt: new Date(refreshed.createdAt).getTime(),
          updatedAt,
          deletedAt: null
        });
        this.scheduleSync(60);
        return {
          ok: true,
          conversationId: id,
          conversationName: name,
          updatedAt: toIso(updatedAt)
        };
      }
      deleteConversations(ids = []) {
        this.ensureReady();
        const normalized = Array.isArray(ids) ? ids.map((id) => String(id || "").trim()).filter(Boolean) : [];
        if (!normalized.length) {
          return { ok: true, deletedCount: 0 };
        }
        const deletedAt = nowMs();
        const placeholders = normalized.map(() => "?").join(", ");
        this.runMutation(
          `
      UPDATE conversations
      SET deleted_at = ?, updated_at = ?
      WHERE id IN (${placeholders});
      `,
          [deletedAt, deletedAt, ...normalized]
        );
        normalized.forEach((id) => {
          this.enqueueOutbox("conversation", id, "delete", {
            id,
            deletedAt
          });
        });
        this.scheduleSync(60);
        return {
          ok: true,
          deletedCount: normalized.length
        };
      }
      cleanConversations(days = 30) {
        this.ensureReady();
        const numDays = Number(days);
        if (!Number.isFinite(numDays) || numDays < 1) {
          throw new Error("days must be a positive number.");
        }
        const cutoff = nowMs() - Math.floor(numDays * 24 * 60 * 60 * 1e3);
        const rows = this.runStatement(
          `
      SELECT id
      FROM conversations
      WHERE deleted_at IS NULL AND updated_at < ?
      ORDER BY updated_at ASC;
      `,
          [cutoff]
        );
        const ids = rows.map((row) => String(row.id));
        if (!ids.length) {
          return { ok: true, deletedCount: 0, ids: [] };
        }
        this.deleteConversations(ids);
        return {
          ok: true,
          deletedCount: ids.length,
          ids
        };
      }
      async runLegacyMigrations() {
        if (this.getMeta("legacy_docs_migrated") !== "true") {
          await this.migrateLegacyDocs();
          this.setMeta("legacy_docs_migrated", "true");
        }
        if (this.getMeta("legacy_sessions_migrated") !== "true") {
          await this.migrateLegacySessions();
          this.setMeta("legacy_sessions_migrated", "true");
        }
      }
      async migrateLegacyDocs() {
        const sourcePath = String(this.legacyDocsPath || "").trim();
        if (!sourcePath || !fs2.existsSync(sourcePath)) {
          return;
        }
        let payload;
        try {
          const raw = await fsp.readFile(sourcePath, "utf8");
          payload = raw ? JSON.parse(raw) : {};
        } catch (_error) {
          payload = {};
        }
        if (!payload || typeof payload !== "object") {
          return;
        }
        this.withTransaction(() => {
          Object.entries(payload).forEach(([id, doc]) => {
            if (!id || !doc || typeof doc !== "object") return;
            const data = deepClone(doc.data || {});
            const parsed = parseRev(doc._rev);
            const revNo = parsed.revNo > 0 ? parsed.revNo : 1;
            const revTag = parsed.revTag || randomTag();
            this.runMutation(
              `
          INSERT OR REPLACE INTO docs (id, rev_no, rev_tag, data_json, updated_at, scope)
          VALUES (?, ?, ?, ?, ?, '');
          `,
              [id, revNo, revTag, JSON.stringify(data), nowMs()]
            );
          });
        });
        const configDoc = this.docGetSync("config");
        if (configDoc?.data) {
          this.updateConfiguredPostgresUrl(extractPostgresUrlFromConfigDoc(configDoc.data));
        }
      }
      resolveLegacyChatPath() {
        const localRows = this.runStatement(
          "SELECT data_json FROM docs WHERE id LIKE 'config_local_%' ORDER BY id ASC;"
        );
        for (const row of localRows) {
          const data = safeJsonParse(row.data_json, {});
          const localPath = String(data?.localChatPath || "").trim();
          if (localPath) return localPath;
        }
        const configDoc = this.docGetSync("config");
        const fallbackPath = String(configDoc?.data?.config?.webdav?.localChatPath || "").trim();
        if (fallbackPath) return fallbackPath;
        return "";
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
          if (!String(fileName).toLowerCase().endsWith(".json")) continue;
          const filePath = path2.join(localPath, fileName);
          let raw = "";
          let stat = null;
          try {
            raw = await fsp.readFile(filePath, "utf8");
            stat = await fsp.stat(filePath);
          } catch (_error) {
            continue;
          }
          const sessionObject = safeJsonParse(raw, null);
          if (!isSessionPayload(sessionObject)) continue;
          const assistantCode = String(sessionObject?.CODE || "AI");
          const conversationName = fileName.replace(/\.json$/i, "") || `Legacy-${assistantCode}`;
          const preview = extractConversationPreview(sessionObject);
          const conversationId = `legacy:${stableHash(filePath)}`;
          const createdAt = Number(stat?.birthtimeMs || stat?.mtimeMs || nowMs());
          const updatedAt = Number(stat?.mtimeMs || nowMs());
          const sizeBytes = Buffer.byteLength(raw, "utf8");
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
              updatedAt
            ]
          );
        }
      }
    };
    module2.exports = {
      StorageService: StorageService2,
      testPostgresConnection: testPostgresConnection2,
      maskPostgresUrl
    };
  }
});

// electron-src/main.ts
var {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Notification,
  screen,
  session,
  nativeTheme
} = require("electron");
var fs = require("fs");
var net = require("net");
var path = require("path");
var { pathToFileURL } = require("url");
var { StorageService, testPostgresConnection } = require_storage_service();
var managedWindows = /* @__PURE__ */ new Map();
var mainWindow = null;
var launcherWindow = null;
var launcherHotkey = null;
var storageService = null;
var isQuitting = false;
var DEV_MAIN_URL = String(process.env.ANYWHERE_DEV_MAIN_URL || "").trim();
var DEV_PRELOAD_PATH = String(process.env.ANYWHERE_DEV_PRELOAD_PATH || "").trim();
var IS_RUNTIME_DEV_SERVER = DEV_MAIN_URL.length > 0;
var DEFAULT_LAUNCHER_SETTINGS = {
  launcherEnabled: true,
  launcherHotkey: "CommandOrControl+Shift+Space"
};
var SUPPORTED_PROMPT_TYPES = /* @__PURE__ */ new Set(["general", "over", "img", "files"]);
var LAUNCHER_WIDTH = 640;
var LAUNCHER_HEIGHT = 56;
var LAUNCHER_MAX_HEIGHT = 440;
var DEEPSEEK_PROXY_HOST = "127.0.0.1";
var DEEPSEEK_PROXY_PREFERRED_PORT = 5001;
var DEEPSEEK_PROXY_READY_TIMEOUT_MS = 12e3;
var DEEPSEEK_LOGIN_URL = "https://chat.deepseek.com";
var DEEPSEEK_LOGIN_PARTITION = "persist:deepseek-login";
var DEEPSEEK_LOGIN_ACCEPT_LANGUAGE = "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7";
var deepSeekProxyState = {
  started: false,
  baseUrl: "",
  port: 0,
  startPromise: null,
  lastError: "",
  moduleEntryPath: ""
};
var deepSeekLoginPromise = null;
var deepSeekLoginHeadersPatched = false;
function extractDeepSeekUserToken(rawToken) {
  const source = String(rawToken || "").trim();
  if (!source) return "";
  try {
    const parsed = JSON.parse(source);
    if (typeof parsed === "string") {
      return extractDeepSeekUserToken(parsed);
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const value = parsed.value;
      if (typeof value === "string") {
        return value.trim();
      }
      if (value !== void 0 && value !== null) {
        return String(value).trim();
      }
    }
  } catch (_error) {
  }
  return source;
}
function getDeepSeekLoginUserAgent() {
  let platformSection = "X11; Linux x86_64";
  if (process.platform === "darwin") {
    platformSection = "Macintosh; Intel Mac OS X 10_15_7";
  } else if (process.platform === "win32") {
    platformSection = "Windows NT 10.0; Win64; x64";
  }
  const chromeVersion = String(process.versions.chrome || "124.0.0.0");
  return `Mozilla/5.0 (${platformSection}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
}
function getDeepSeekSecChUaPlatform() {
  if (process.platform === "darwin") return '"macOS"';
  if (process.platform === "win32") return '"Windows"';
  return '"Linux"';
}
function setHeaderCaseInsensitive(headers, name, value) {
  const existingKey = Object.keys(headers).find(
    (key) => String(key).toLowerCase() === name.toLowerCase()
  );
  if (existingKey && existingKey !== name) {
    delete headers[existingKey];
  }
  headers[name] = value;
}
function deleteHeaderCaseInsensitive(headers, name) {
  const existingKey = Object.keys(headers).find(
    (key) => String(key).toLowerCase() === name.toLowerCase()
  );
  if (existingKey) {
    delete headers[existingKey];
  }
}
function installDeepSeekLoginHeaderPatch(targetSession, userAgent) {
  if (deepSeekLoginHeadersPatched) return;
  deepSeekLoginHeadersPatched = true;
  targetSession.webRequest.onBeforeSendHeaders(
    { urls: ["https://chat.deepseek.com/*"] },
    (details, callback) => {
      const requestHeaders = { ...details.requestHeaders || {} };
      setHeaderCaseInsensitive(requestHeaders, "User-Agent", userAgent);
      setHeaderCaseInsensitive(requestHeaders, "Accept-Language", DEEPSEEK_LOGIN_ACCEPT_LANGUAGE);
      setHeaderCaseInsensitive(
        requestHeaders,
        "Sec-CH-UA",
        '"Not A(Brand";v="99", "Google Chrome";v="124", "Chromium";v="124"'
      );
      setHeaderCaseInsensitive(requestHeaders, "Sec-CH-UA-Mobile", "?0");
      setHeaderCaseInsensitive(requestHeaders, "Sec-CH-UA-Platform", getDeepSeekSecChUaPlatform());
      deleteHeaderCaseInsensitive(requestHeaders, "X-Requested-With");
      callback({ cancel: false, requestHeaders });
    }
  );
}
function resolveAppFile(...parts) {
  return path.join(app.getAppPath(), ...parts);
}
function resolveMainPreloadPath() {
  if (!DEV_PRELOAD_PATH) return resolveAppFile("runtime", "preload.js");
  return path.isAbsolute(DEV_PRELOAD_PATH) ? DEV_PRELOAD_PATH : path.resolve(app.getAppPath(), DEV_PRELOAD_PATH);
}
function resolveDeepSeekLoginPreloadPath() {
  return resolveAppFile("electron", "deepseek_login_preload.js");
}
function resolveMainEntryUrl() {
  if (IS_RUNTIME_DEV_SERVER) return DEV_MAIN_URL;
  return pathToFileURL(resolveAppFile("runtime", "main", "index.html")).toString();
}
function resolveLauncherEntryUrl() {
  if (IS_RUNTIME_DEV_SERVER) {
    try {
      return new URL("launcher.html", DEV_MAIN_URL).toString();
    } catch (_error) {
      const base = DEV_MAIN_URL.endsWith("/") ? DEV_MAIN_URL : `${DEV_MAIN_URL}/`;
      return `${base}launcher.html`;
    }
  }
  return pathToFileURL(resolveAppFile("runtime", "main", "launcher.html")).toString();
}
function normalizeWebPreferences(webPreferences = {}, baseDir) {
  const normalized = { ...webPreferences };
  if (normalized.preload) {
    normalized.preload = path.isAbsolute(normalized.preload) ? normalized.preload : path.resolve(baseDir, normalized.preload);
  }
  normalized.contextIsolation = false;
  normalized.sandbox = false;
  normalized.nodeIntegration = false;
  return normalized;
}
function toLoadUrl(entryPath, baseDir) {
  const raw = String(entryPath || "");
  if (/^https?:\/\//i.test(raw) || /^file:\/\//i.test(raw)) {
    return raw;
  }
  const [filePart, queryPart] = raw.split("?");
  const absolutePath = path.isAbsolute(filePart) ? filePart : path.resolve(baseDir, filePart);
  const fileUrl = pathToFileURL(absolutePath);
  if (queryPart) fileUrl.search = queryPart;
  return fileUrl.toString();
}
function normalizePromptType(rawType) {
  const value = String(rawType || "general").toLowerCase();
  if (value === "text") return "over";
  if (value === "image") return "img";
  if (value === "file") return "files";
  return SUPPORTED_PROMPT_TYPES.has(value) ? value : "general";
}
function getShimDataRoot() {
  return path.join(app.getPath("userData"), "utools-shim");
}
function getShimDocumentsPath() {
  return path.join(getShimDataRoot(), "documents.json");
}
function readShimDocuments() {
  const docsPath = getShimDocumentsPath();
  if (!fs.existsSync(docsPath)) return {};
  try {
    const raw = fs.readFileSync(docsPath, "utf8");
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.error("[Launcher] Failed to read shim documents:", error);
    return {};
  }
}
function getStorageServiceInstance() {
  if (!storageService || !storageService.isReady()) {
    throw new Error("Storage service is not initialized.");
  }
  return storageService;
}
async function ensureStorageServiceReady() {
  if (storageService && storageService.isReady()) return storageService;
  if (!storageService) {
    storageService = new StorageService({
      dataRoot: getShimDataRoot(),
      legacyDocsPath: getShimDocumentsPath()
    });
  }
  await storageService.init();
  return storageService;
}
function readStoredDocData(docId) {
  try {
    if (storageService && storageService.isReady()) {
      const doc = storageService.docGetSync(docId);
      if (doc && doc.data && typeof doc.data === "object") {
        return doc.data;
      }
    }
  } catch (error) {
    console.warn(`[Storage] Failed to read doc "${docId}" from storage service:`, error);
  }
  const docs = readShimDocuments();
  const docData = docs?.[docId]?.data;
  return docData && typeof docData === "object" ? docData : {};
}
function readStoredLauncherSettings() {
  const sharedConfig = readStoredDocData("config")?.config || {};
  const launcherEnabled = sharedConfig.launcherEnabled === void 0 ? DEFAULT_LAUNCHER_SETTINGS.launcherEnabled : !!sharedConfig.launcherEnabled;
  const launcherHotkeyValue = typeof sharedConfig.launcherHotkey === "string" ? sharedConfig.launcherHotkey.trim() : "";
  const normalizedHotkey = launcherHotkeyValue || DEFAULT_LAUNCHER_SETTINGS.launcherHotkey;
  return { launcherEnabled, launcherHotkey: normalizedHotkey };
}
function readStoredThemeSettings() {
  return readStoredDocData("config")?.config || {};
}
function resolveThemeSource(settings = {}) {
  const mode = typeof settings.themeMode === "string" ? settings.themeMode.trim().toLowerCase() : "";
  if (mode === "dark" || mode === "light" || mode === "system") {
    return mode;
  }
  if (typeof settings.isDarkMode === "boolean") {
    return settings.isDarkMode ? "dark" : "light";
  }
  return "system";
}
function applyNativeThemeSource(settings = {}) {
  if (process.platform !== "darwin") return "system";
  const source = resolveThemeSource(settings);
  if (nativeTheme.themeSource !== source) {
    nativeTheme.themeSource = source;
  }
  return source;
}
function readStoredPrompts() {
  const promptsData = readStoredDocData("prompts");
  if (!promptsData || typeof promptsData !== "object") return [];
  return Object.entries(promptsData).filter(
    ([code, prompt]) => code && prompt && typeof prompt === "object" && prompt.enable !== false
  ).map(([code, prompt]) => ({
    code,
    prompt: typeof prompt.prompt === "string" ? prompt.prompt : "",
    type: normalizePromptType(prompt.type),
    showMode: typeof prompt.showMode === "string" ? prompt.showMode : "window",
    matchRegex: typeof prompt.matchRegex === "string" ? prompt.matchRegex : "",
    icon: typeof prompt.icon === "string" ? prompt.icon : ""
  })).sort((a, b) => a.code.localeCompare(b.code));
}
function normalizeLauncherHotkey(rawHotkey) {
  if (typeof rawHotkey !== "string") return DEFAULT_LAUNCHER_SETTINGS.launcherHotkey;
  const trimmed = rawHotkey.trim();
  return trimmed || DEFAULT_LAUNCHER_SETTINGS.launcherHotkey;
}
function registerManagedWindow(win) {
  managedWindows.set(win.id, win);
  win.on("closed", () => {
    managedWindows.delete(win.id);
  });
}
function applyMacVibrancy(win, options = {}) {
  if (process.platform !== "darwin") return;
  if (!win || win.isDestroyed()) return;
  const material = typeof options.vibrancy === "string" ? options.vibrancy.trim() : "";
  if (!material) return;
  try {
    if (typeof win.setVisualEffectState === "function") {
      const visualEffectState = typeof options.visualEffectState === "string" ? options.visualEffectState : "active";
      win.setVisualEffectState(visualEffectState);
    }
    const duration = Number(options.animationDuration);
    if (Number.isFinite(duration) && duration >= 0) {
      win.setVibrancy(material, { animationDuration: Math.round(duration) });
      return;
    }
    win.setVibrancy(material);
  } catch (error) {
    console.warn(`[Vibrancy] Failed to apply vibrancy "${material}":`, error);
  }
}
function getLauncherBounds() {
  const width = LAUNCHER_WIDTH;
  const height = LAUNCHER_HEIGHT;
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor) || screen.getPrimaryDisplay();
  const workArea = display.workArea || display.bounds;
  const padding = 12;
  const x = Math.round(workArea.x + (workArea.width - width) / 2);
  const preferredY = Math.round(workArea.y + Math.max(96, workArea.height * 0.28));
  const maxY = workArea.y + workArea.height - height - padding;
  const y = Math.max(workArea.y + padding, Math.min(preferredY, maxY));
  return { x, y, width, height };
}
function createLauncherWindow() {
  if (launcherWindow && !launcherWindow.isDestroyed()) return launcherWindow;
  const launcherPreload = resolveAppFile("electron", "launcher_preload.js");
  launcherWindow = new BrowserWindow({
    width: LAUNCHER_WIDTH,
    height: LAUNCHER_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: "#00000000",
    roundedCorners: false,
    webPreferences: {
      preload: launcherPreload,
      contextIsolation: false,
      sandbox: false,
      nodeIntegration: false
    }
  });
  launcherWindow.on("blur", () => {
    if (launcherWindow && !launcherWindow.isDestroyed()) {
      launcherWindow.hide();
    }
  });
  launcherWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    launcherWindow.hide();
  });
  launcherWindow.on("closed", () => {
    launcherWindow = null;
  });
  launcherWindow.loadURL(resolveLauncherEntryUrl());
  return launcherWindow;
}
function hideLauncherWindow() {
  if (!launcherWindow || launcherWindow.isDestroyed()) return;
  launcherWindow.hide();
}
function showLauncherWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const launcher = createLauncherWindow();
  const bounds = getLauncherBounds();
  launcher.setBounds(bounds, false);
  launcher.show();
  launcher.focus();
  if (launcher.webContents.isLoading()) {
    launcher.webContents.once("did-finish-load", () => {
      if (!launcher.isDestroyed()) {
        launcher.webContents.send("launcher:refresh");
        launcher.webContents.send("launcher:focus-input");
      }
    });
    return;
  }
  launcher.webContents.send("launcher:refresh");
  launcher.webContents.send("launcher:focus-input");
}
function toggleLauncherWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (launcherWindow && !launcherWindow.isDestroyed() && launcherWindow.isVisible()) {
    hideLauncherWindow();
    return;
  }
  showLauncherWindow();
}
function registerLauncherHotkey(rawSettings = {}) {
  const launcherEnabled = rawSettings.launcherEnabled === void 0 ? DEFAULT_LAUNCHER_SETTINGS.launcherEnabled : !!rawSettings.launcherEnabled;
  const normalizedHotkey = normalizeLauncherHotkey(rawSettings.launcherHotkey);
  const previousHotkey = launcherHotkey;
  if (!launcherEnabled) {
    if (previousHotkey && globalShortcut.isRegistered(previousHotkey)) {
      globalShortcut.unregister(previousHotkey);
    }
    launcherHotkey = null;
    hideLauncherWindow();
    return { ok: true, launcherEnabled, launcherHotkey: normalizedHotkey, activeHotkey: null };
  }
  if (previousHotkey && previousHotkey === normalizedHotkey && globalShortcut.isRegistered(previousHotkey)) {
    return {
      ok: true,
      launcherEnabled,
      launcherHotkey: normalizedHotkey,
      activeHotkey: previousHotkey
    };
  }
  if (previousHotkey && globalShortcut.isRegistered(previousHotkey)) {
    globalShortcut.unregister(previousHotkey);
  }
  let registered = false;
  let registerError = "";
  try {
    registered = globalShortcut.register(normalizedHotkey, () => {
      toggleLauncherWindow();
    });
  } catch (error) {
    registerError = String(error?.message || error);
  }
  if (registered) {
    launcherHotkey = normalizedHotkey;
    return {
      ok: true,
      launcherEnabled,
      launcherHotkey: normalizedHotkey,
      activeHotkey: normalizedHotkey
    };
  }
  launcherHotkey = null;
  if (previousHotkey && previousHotkey !== normalizedHotkey) {
    try {
      const restored = globalShortcut.register(previousHotkey, () => {
        toggleLauncherWindow();
      });
      if (restored) {
        launcherHotkey = previousHotkey;
      }
    } catch (_error) {
    }
  }
  const fallbackMsg = registerError || `Unable to register global shortcut "${normalizedHotkey}".`;
  const recoveryMsg = launcherHotkey ? ` Keeping previous shortcut "${launcherHotkey}".` : "";
  return {
    ok: false,
    launcherEnabled,
    launcherHotkey: normalizedHotkey,
    activeHotkey: launcherHotkey,
    error: `${fallbackMsg}${recoveryMsg}`
  };
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function getDeepSeekProxyDataDir() {
  const dir = path.join(app.getPath("userData"), "deepseek-api");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function isPortAvailable(port, host = DEEPSEEK_PROXY_HOST) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => {
      resolve(false);
    });
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    try {
      server.listen(port, host);
    } catch (_error) {
      resolve(false);
    }
  });
}
function getFreePort(host = DEEPSEEK_PROXY_HOST) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", (error) => {
      reject(error);
    });
    server.once("listening", () => {
      const addressInfo = server.address();
      const port = addressInfo && typeof addressInfo === "object" ? addressInfo.port : 0;
      server.close(() => {
        if (port > 0) {
          resolve(port);
        } else {
          reject(new Error("Failed to allocate free port."));
        }
      });
    });
    server.listen(0, host);
  });
}
function resolveDeepSeekModuleEntryPath() {
  if (deepSeekProxyState.moduleEntryPath) {
    return deepSeekProxyState.moduleEntryPath;
  }
  const packageJsonPath = require.resolve("@ziuchen/deepseek-api/package.json");
  const packageDir = path.dirname(packageJsonPath);
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const mainEntry = typeof packageJson.main === "string" && packageJson.main.trim() ? packageJson.main.trim() : "";
  const candidates = [
    path.join(packageDir, "dist", "index.mjs"),
    mainEntry ? path.join(packageDir, mainEntry) : "",
    path.join(packageDir, "dist", "index.js")
  ].filter(Boolean);
  const entryPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!entryPath) {
    throw new Error("Unable to resolve @ziuchen/deepseek-api entry file.");
  }
  deepSeekProxyState.moduleEntryPath = entryPath;
  return entryPath;
}
async function isDeepSeekProxyReady(baseOrigin) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(`${baseOrigin}/v1/models`, {
      method: "GET",
      signal: controller.signal
    });
    return response.ok;
  } catch (_error) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
async function waitForDeepSeekProxyReady(baseOrigin, timeoutMs = DEEPSEEK_PROXY_READY_TIMEOUT_MS) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isDeepSeekProxyReady(baseOrigin)) {
      return true;
    }
    await delay(250);
  }
  return false;
}
async function startDeepSeekProxy() {
  const preferredAvailable = await isPortAvailable(DEEPSEEK_PROXY_PREFERRED_PORT);
  const selectedPort = preferredAvailable ? DEEPSEEK_PROXY_PREFERRED_PORT : await getFreePort(DEEPSEEK_PROXY_HOST);
  const baseOrigin = `http://${DEEPSEEK_PROXY_HOST}:${selectedPort}`;
  process.env.LISTEN_HOST = DEEPSEEK_PROXY_HOST;
  process.env.LISTEN_PORT = String(selectedPort);
  process.env.DATA_DIR = getDeepSeekProxyDataDir();
  const entryPath = resolveDeepSeekModuleEntryPath();
  await import(pathToFileURL(entryPath).toString());
  const isReady = await waitForDeepSeekProxyReady(baseOrigin);
  if (!isReady) {
    throw new Error("DeepSeek proxy did not become ready in time.");
  }
  deepSeekProxyState.started = true;
  deepSeekProxyState.baseUrl = `${baseOrigin}/v1`;
  deepSeekProxyState.port = selectedPort;
  deepSeekProxyState.lastError = "";
  return {
    ok: true,
    baseUrl: deepSeekProxyState.baseUrl,
    port: deepSeekProxyState.port
  };
}
async function ensureDeepSeekProxy() {
  if (deepSeekProxyState.started && deepSeekProxyState.baseUrl) {
    return {
      ok: true,
      baseUrl: deepSeekProxyState.baseUrl,
      port: deepSeekProxyState.port
    };
  }
  if (deepSeekProxyState.startPromise) {
    return deepSeekProxyState.startPromise;
  }
  deepSeekProxyState.startPromise = (async () => {
    try {
      return await startDeepSeekProxy();
    } catch (error) {
      const errorText = String(error?.message || error);
      deepSeekProxyState.started = false;
      deepSeekProxyState.baseUrl = "";
      deepSeekProxyState.port = 0;
      deepSeekProxyState.lastError = errorText;
      return {
        ok: false,
        error: errorText
      };
    } finally {
      deepSeekProxyState.startPromise = null;
    }
  })();
  return deepSeekProxyState.startPromise;
}
function createDeepSeekLoginWindow(owner) {
  const userAgent = getDeepSeekLoginUserAgent();
  const loginSession = session.fromPartition(DEEPSEEK_LOGIN_PARTITION);
  installDeepSeekLoginHeaderPatch(loginSession, userAgent);
  const loginPreloadPath = resolveDeepSeekLoginPreloadPath();
  const loginWindow = new BrowserWindow({
    width: 440,
    height: 760,
    minWidth: 400,
    minHeight: 640,
    show: true,
    autoHideMenuBar: true,
    parent: owner,
    modal: false,
    title: "DeepSeek Login",
    webPreferences: {
      preload: fs.existsSync(loginPreloadPath) ? loginPreloadPath : void 0,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      partition: DEEPSEEK_LOGIN_PARTITION
    }
  });
  loginWindow.webContents.setUserAgent(userAgent);
  loginWindow.loadURL(DEEPSEEK_LOGIN_URL, { userAgent });
  return loginWindow;
}
function loginDeepSeek(owner) {
  if (deepSeekLoginPromise) {
    return deepSeekLoginPromise;
  }
  deepSeekLoginPromise = new Promise((resolve) => {
    const loginWindow = createDeepSeekLoginWindow(owner);
    let settled = false;
    let pollTimer = null;
    let latestToken = "";
    let allowClose = false;
    let closeGuardInProgress = false;
    const cleanup = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };
    const settle = (payload) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(payload);
      if (!loginWindow.isDestroyed()) {
        loginWindow.close();
      }
    };
    const tryReadUserToken = async () => {
      if (settled || loginWindow.isDestroyed()) return;
      try {
        const rawToken = await loginWindow.webContents.executeJavaScript(
          `(() => {
            try {
              const raw = localStorage.getItem('userToken');
              return typeof raw === 'string' ? raw.trim() : '';
            } catch (_error) {
              return '';
            }
          })()`,
          true
        );
        const parsedToken = extractDeepSeekUserToken(rawToken);
        if (parsedToken) {
          latestToken = parsedToken;
        }
      } catch (_error) {
      }
    };
    pollTimer = setInterval(() => {
      tryReadUserToken().catch(() => {
      });
    }, 1200);
    loginWindow.webContents.on("did-finish-load", () => {
      tryReadUserToken().catch(() => {
      });
    });
    loginWindow.on("close", (event) => {
      if (allowClose || settled) return;
      event.preventDefault();
      if (closeGuardInProgress) return;
      closeGuardInProgress = true;
      tryReadUserToken().catch(() => {
      }).finally(() => {
        allowClose = true;
        closeGuardInProgress = false;
        if (!loginWindow.isDestroyed()) {
          loginWindow.close();
        }
      });
    });
    loginWindow.on("closed", () => {
      if (!settled) {
        if (latestToken) {
          settle({ ok: true, userToken: latestToken });
        } else {
          settled = true;
          cleanup();
          resolve({ ok: false, cancelled: true });
        }
      }
    });
  }).finally(() => {
    deepSeekLoginPromise = null;
  });
  return deepSeekLoginPromise;
}
function createMainWindow() {
  const preloadPath = resolveMainPreloadPath();
  const isMac = process.platform === "darwin";
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 1e3,
    minHeight: 680,
    show: false,
    backgroundColor: isMac ? "#00000000" : "#f7f7f5",
    autoHideMenuBar: true,
    title: isMac ? "" : "Sanft",
    ...isMac ? {
      titleBarStyle: "hiddenInset",
      transparent: true
    } : {},
    webPreferences: {
      preload: preloadPath,
      contextIsolation: false,
      sandbox: false,
      nodeIntegration: false
    }
  });
  mainWindow.on("closed", () => {
    if (launcherWindow && !launcherWindow.isDestroyed()) {
      launcherWindow.destroy();
      launcherWindow = null;
    }
    mainWindow = null;
  });
  mainWindow.once("ready-to-show", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.show();
  });
  mainWindow.loadURL(resolveMainEntryUrl());
  applyMacVibrancy(mainWindow, {
    vibrancy: "sidebar",
    visualEffectState: "active",
    animationDuration: 120
  });
}
function ensureBuildArtifacts() {
  if (IS_RUNTIME_DEV_SERVER) {
    const preloadPath = resolveMainPreloadPath();
    const preloadDir = path.dirname(preloadPath);
    const requiredPaths2 = [
      preloadPath,
      path.join(preloadDir, "window_preload.js"),
      path.join(preloadDir, "fast_window_preload.js"),
      path.join(preloadDir, "runtime", "file_runtime.js"),
      path.join(preloadDir, "runtime", "mcp_runtime.js"),
      path.join(preloadDir, "runtime", "skill_runtime.js")
    ];
    const missing2 = requiredPaths2.filter((file) => !fs.existsSync(file));
    if (missing2.length === 0) return;
    const message2 = [
      "Development preload resources are missing.",
      "Run `./dev.sh` so backend watch can generate preload files.",
      "",
      ...missing2.map((item) => `- ${item}`)
    ].join("\n");
    dialog.showErrorBox("Sanft Dev Resources Missing", message2);
    app.quit();
    return;
  }
  const requiredPaths = [
    resolveAppFile("electron", "launcher_preload.js"),
    resolveAppFile("electron", "deepseek_login_preload.js"),
    resolveAppFile("runtime", "main", "index.html"),
    resolveAppFile("runtime", "main", "launcher.html"),
    resolveAppFile("runtime", "preload.js"),
    resolveAppFile("runtime", "window_preload.js"),
    resolveAppFile("runtime", "fast_window_preload.js"),
    resolveAppFile("runtime", "runtime", "file_runtime.js"),
    resolveAppFile("runtime", "runtime", "mcp_runtime.js"),
    resolveAppFile("runtime", "runtime", "skill_runtime.js")
  ];
  const missing = requiredPaths.filter((file) => !fs.existsSync(file));
  if (missing.length === 0) return;
  const message = [
    "Desktop resources are missing.",
    "Run `pnpm build` at project root before launching Electron.",
    "",
    ...missing.map((item) => `- ${item}`)
  ].join("\n");
  dialog.showErrorBox("Sanft Build Missing", message);
  app.quit();
}
ipcMain.on("utools:get-user-data-path", (event) => {
  event.returnValue = path.join(app.getPath("userData"), "utools-shim");
});
ipcMain.on("utools:is-dev", (event) => {
  event.returnValue = !app.isPackaged;
});
ipcMain.on("utools:get-primary-display", (event) => {
  event.returnValue = screen.getPrimaryDisplay();
});
ipcMain.on("utools:get-display-nearest-point", (event, point) => {
  const fallback = screen.getPrimaryDisplay();
  try {
    event.returnValue = screen.getDisplayNearestPoint(point || { x: 0, y: 0 });
  } catch (_error) {
    event.returnValue = fallback;
  }
});
ipcMain.on("utools:get-cursor-screen-point", (event) => {
  event.returnValue = screen.getCursorScreenPoint();
});
ipcMain.on("utools:sync-native-theme", (_event, payload = {}) => {
  if (process.platform !== "darwin") return;
  applyNativeThemeSource(payload);
  if (mainWindow && !mainWindow.isDestroyed()) {
    applyMacVibrancy(mainWindow, {
      vibrancy: "sidebar",
      visualEffectState: "active",
      animationDuration: 0
    });
  }
  if (launcherWindow && !launcherWindow.isDestroyed()) {
    applyMacVibrancy(launcherWindow, {
      vibrancy: "sidebar",
      visualEffectState: "active",
      animationDuration: 0
    });
  }
});
ipcMain.on("utools:create-browser-window", (event, payload = {}) => {
  const entryPath = payload.entryPath || "";
  const rawOptions = payload.options || {};
  const baseDir = payload.baseDir && path.isAbsolute(payload.baseDir) ? payload.baseDir : resolveAppFile("runtime");
  const normalizedOptions = {
    ...rawOptions,
    webPreferences: normalizeWebPreferences(rawOptions.webPreferences || {}, baseDir)
  };
  const windowVibrancy = typeof normalizedOptions.macOSVibrancy === "string" ? normalizedOptions.macOSVibrancy : typeof normalizedOptions.vibrancy === "string" ? normalizedOptions.vibrancy : "";
  const windowVisualEffectState = typeof normalizedOptions.macOSVisualEffectState === "string" ? normalizedOptions.macOSVisualEffectState : "active";
  const windowVibrancyAnimationDuration = normalizedOptions.macOSVibrancyAnimationDuration;
  delete normalizedOptions.macOSVibrancy;
  delete normalizedOptions.macOSVisualEffectState;
  delete normalizedOptions.macOSVibrancyAnimationDuration;
  delete normalizedOptions.vibrancy;
  const win = new BrowserWindow(normalizedOptions);
  applyMacVibrancy(win, {
    vibrancy: windowVibrancy,
    visualEffectState: windowVisualEffectState,
    animationDuration: windowVibrancyAnimationDuration
  });
  registerManagedWindow(win);
  const readyChannel = `utools:window-ready:${win.id}`;
  win.webContents.once("did-finish-load", () => {
    if (!event.sender.isDestroyed()) {
      event.sender.send(readyChannel);
    }
  });
  const url = toLoadUrl(entryPath, baseDir);
  win.loadURL(url);
  event.returnValue = win.id;
});
ipcMain.on("utools:window-query", (event, payload = {}) => {
  const id = Number(payload.id);
  const query = payload.query;
  const win = managedWindows.get(id);
  if (!win || win.isDestroyed()) {
    event.returnValue = query === "isDestroyed";
    return;
  }
  switch (query) {
    case "isDestroyed":
      event.returnValue = win.isDestroyed();
      break;
    case "isAlwaysOnTop":
      event.returnValue = win.isAlwaysOnTop();
      break;
    case "isMaximized":
      event.returnValue = win.isMaximized();
      break;
    default:
      event.returnValue = null;
      break;
  }
});
ipcMain.on("utools:window-action", (_event, payload = {}) => {
  const id = Number(payload.id);
  const action = payload.action;
  const arg = payload.arg;
  const win = managedWindows.get(id);
  if (!win || win.isDestroyed()) return;
  switch (action) {
    case "show":
      win.show();
      break;
    case "hide":
      win.hide();
      break;
    case "close":
      win.close();
      break;
    case "minimize":
      win.minimize();
      break;
    case "maximize":
      if (!win.isMaximized()) win.maximize();
      break;
    case "unmaximize":
      if (win.isMaximized()) win.unmaximize();
      break;
    case "setAlwaysOnTop":
      win.setAlwaysOnTop(!!arg);
      break;
    default:
      break;
  }
});
ipcMain.on("utools:window-webcontents-send", (_event, payload = {}) => {
  const id = Number(payload.id);
  const channel = payload.channel;
  const data = payload.data;
  const win = managedWindows.get(id);
  if (!win || win.isDestroyed()) return;
  win.webContents.send(channel, data);
});
ipcMain.on("utools:window-open-devtools", (_event, payload = {}) => {
  const id = Number(payload.id);
  const options = payload.options || { mode: "detach" };
  const win = managedWindows.get(id);
  if (!win || win.isDestroyed()) return;
  win.webContents.openDevTools(options);
});
ipcMain.on("utools:show-save-dialog", (event, options = {}) => {
  const owner = BrowserWindow.fromWebContents(event.sender) || mainWindow || void 0;
  event.returnValue = dialog.showSaveDialogSync(owner, options);
});
ipcMain.on("utools:show-open-dialog", (event, options = {}) => {
  const owner = BrowserWindow.fromWebContents(event.sender) || mainWindow || void 0;
  event.returnValue = dialog.showOpenDialogSync(owner, options);
});
ipcMain.on("utools:show-notification", (_event, payload = {}) => {
  const title = payload.title || "Sanft";
  const body = payload.body || "";
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
});
ipcMain.on("utools:main-window-action", (_event, payload = {}) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const action = payload.action;
  if (action === "hide") {
    mainWindow.hide();
  } else if (action === "show") {
    mainWindow.show();
    mainWindow.focus();
  } else if (action === "close") {
    mainWindow.close();
  } else if (action === "minimize") {
    mainWindow.minimize();
  } else if (action === "maximize") {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});
ipcMain.on("utools:send-to-parent", (event, payload = {}) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (event.sender.id === mainWindow.webContents.id) return;
  const channel = payload.channel;
  const data = payload.payload;
  mainWindow.webContents.send(channel, data);
});
ipcMain.on("storage:doc-get-sync", (event, docId) => {
  try {
    const service = getStorageServiceInstance();
    event.returnValue = service.docGetSync(docId);
  } catch (error) {
    console.error("[Storage] storage:doc-get-sync failed:", error);
    event.returnValue = null;
  }
});
ipcMain.on("storage:doc-put-sync", (event, doc) => {
  try {
    const service = getStorageServiceInstance();
    event.returnValue = service.docPutSync(doc);
  } catch (error) {
    console.error("[Storage] storage:doc-put-sync failed:", error);
    event.returnValue = {
      ok: false,
      error: true,
      name: "storage_error",
      message: String(error?.message || error)
    };
  }
});
ipcMain.on("storage:doc-remove-sync", (event, docId) => {
  try {
    const service = getStorageServiceInstance();
    event.returnValue = service.docRemoveSync(docId);
  } catch (error) {
    console.error("[Storage] storage:doc-remove-sync failed:", error);
    event.returnValue = {
      ok: false,
      error: true,
      name: "storage_error",
      message: String(error?.message || error)
    };
  }
});
ipcMain.handle("storage:conversation-list", async (_event, filter = {}) => {
  const service = await ensureStorageServiceReady();
  return service.listConversations(filter || {});
});
ipcMain.handle("storage:conversation-get", async (_event, conversationId) => {
  const service = await ensureStorageServiceReady();
  return service.getConversation(conversationId);
});
ipcMain.handle("storage:conversation-upsert", async (_event, payload = {}) => {
  const service = await ensureStorageServiceReady();
  return service.upsertConversation(payload || {});
});
ipcMain.handle("storage:conversation-rename", async (_event, payload = {}) => {
  const service = await ensureStorageServiceReady();
  const conversationId = payload?.conversationId;
  const conversationName = payload?.conversationName;
  return service.renameConversation(conversationId, conversationName);
});
ipcMain.handle("storage:conversation-delete", async (_event, ids = []) => {
  const service = await ensureStorageServiceReady();
  return service.deleteConversations(Array.isArray(ids) ? ids : []);
});
ipcMain.handle("storage:conversation-clean", async (_event, days = 30) => {
  const service = await ensureStorageServiceReady();
  return service.cleanConversations(days);
});
ipcMain.handle("storage:health-get", async () => {
  const service = await ensureStorageServiceReady();
  return service.getStorageHealth();
});
ipcMain.handle("storage:postgres-test", async (_event, connectionString) => {
  return testPostgresConnection(connectionString);
});
ipcMain.handle("storage:sync-now", async () => {
  const service = await ensureStorageServiceReady();
  return service.syncNow();
});
ipcMain.handle("deepseek:ensure-proxy", async () => {
  return ensureDeepSeekProxy();
});
ipcMain.handle("deepseek:login", async (event) => {
  const owner = BrowserWindow.fromWebContents(event.sender) || mainWindow || void 0;
  return loginDeepSeek(owner);
});
ipcMain.handle("launcher:get-prompts", () => {
  return readStoredPrompts();
});
ipcMain.handle("launcher:update-settings", (_event, payload = {}) => {
  return registerLauncherHotkey(payload);
});
ipcMain.on("launcher:close", () => {
  hideLauncherWindow();
});
ipcMain.on("launcher:toggle", () => {
  toggleLauncherWindow();
});
ipcMain.handle("launcher:get-bounds", () => {
  if (!launcherWindow || launcherWindow.isDestroyed()) return null;
  return launcherWindow.getBounds();
});
ipcMain.on("launcher:set-position", (_event, payload = {}) => {
  if (!launcherWindow || launcherWindow.isDestroyed()) return;
  const x = Number(payload.x);
  const y = Number(payload.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const bounds = launcherWindow.getBounds();
  const display = screen.getDisplayNearestPoint({ x, y }) || screen.getPrimaryDisplay();
  const workArea = display.workArea || display.bounds;
  const maxX = workArea.x + workArea.width - bounds.width;
  const maxY = workArea.y + workArea.height - bounds.height;
  const clampedX = Math.max(workArea.x, Math.min(Math.round(x), maxX));
  const clampedY = Math.max(workArea.y, Math.min(Math.round(y), maxY));
  launcherWindow.setPosition(clampedX, clampedY, false);
});
ipcMain.on("launcher:set-size", (_event, payload = {}) => {
  if (!launcherWindow || launcherWindow.isDestroyed()) return;
  const rawHeight = Number(payload.height);
  if (!Number.isFinite(rawHeight)) return;
  const bounds = launcherWindow.getBounds();
  const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y }) || screen.getPrimaryDisplay();
  const workArea = display.workArea || display.bounds;
  const maxAllowedHeight = Math.max(
    LAUNCHER_HEIGHT,
    Math.min(LAUNCHER_MAX_HEIGHT, workArea.height - 12)
  );
  const nextHeight = Math.max(LAUNCHER_HEIGHT, Math.min(Math.round(rawHeight), maxAllowedHeight));
  const maxY = workArea.y + workArea.height - nextHeight;
  const nextY = Math.max(workArea.y, Math.min(bounds.y, maxY));
  launcherWindow.setBounds(
    {
      x: bounds.x,
      y: nextY,
      width: bounds.width,
      height: nextHeight
    },
    false
  );
});
ipcMain.on("launcher:execute", (_event, action = {}) => {
  hideLauncherWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const code = typeof action.code === "string" ? action.code.trim() : "";
  if (!code) return;
  const type = typeof action.type === "string" ? action.type : "over";
  const payload = action.payload;
  mainWindow.webContents.send("launcher:execute-action", {
    code,
    type,
    payload,
    from: "launcher"
  });
});
app.commandLine.appendSwitch("disable-blink-features", "AutomationControlled");
app.commandLine.appendSwitch("lang", "zh-CN");
app.whenReady().then(async () => {
  ensureBuildArtifacts();
  try {
    await ensureStorageServiceReady();
  } catch (error) {
    const message = String(error?.message || error);
    dialog.showErrorBox(
      "Sanft Storage Initialization Failed",
      `Failed to initialize local storage.

${message}`
    );
    app.quit();
    return;
  }
  applyNativeThemeSource(readStoredThemeSettings());
  createMainWindow();
  const launcherResult = registerLauncherHotkey(readStoredLauncherSettings());
  if (!launcherResult.ok) {
    console.warn("[Launcher] Shortcut registration failed:", launcherResult.error);
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
app.on("before-quit", () => {
  isQuitting = true;
});
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (storageService) {
    storageService.dispose().catch((error) => {
      console.warn("[Storage] Dispose failed during quit:", error);
    });
  }
});

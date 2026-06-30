const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const BACKUP_DIR = path.join(ROOT, "database", "backups");
const LOCAL_PG_BIN = path.join(ROOT, ".local-postgres", "dist", "pgsql", "bin");
const DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/crm";

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function readDatabaseUrl() {
  if (process.env.DATABASE_URL && String(process.env.DATABASE_URL).trim()) {
    return String(process.env.DATABASE_URL).trim();
  }

  const envPath = path.join(ROOT, "backend", ".env");
  if (!fs.existsSync(envPath)) {
    return DEFAULT_DATABASE_URL;
  }

  const content = fs.readFileSync(envPath, "utf8");
  const match = content.match(/^DATABASE_URL\s*=\s*(.+)\s*$/m);
  if (!match) return DEFAULT_DATABASE_URL;

  const raw = match[1].trim();
  const unquoted = raw.replace(/^["']|["']$/g, "");
  return unquoted || DEFAULT_DATABASE_URL;
}

function resolvePgBin(toolName) {
  if (process.platform === "win32") {
    const exe = path.join(LOCAL_PG_BIN, `${toolName}.exe`);
    if (fs.existsSync(exe)) return exe;
    return `${toolName}.exe`;
  }
  return toolName;
}

function runTool(toolName, args, options = {}) {
  const bin = resolvePgBin(toolName);
  const result = spawnSync(bin, args, {
    cwd: ROOT,
    stdio: options.stdio || "pipe",
    encoding: "utf8",
    env: { ...process.env, ...(options.env || {}) }
  });
  return result;
}

function timestampNow() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    "-" +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

function listBackupFiles() {
  ensureBackupDir();
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((name) => name.toLowerCase().endsWith(".sql"))
    .map((name) => {
      const fullPath = path.join(BACKUP_DIR, name);
      const stat = fs.statSync(fullPath);
      return {
        name,
        fullPath,
        size: stat.size,
        mtimeMs: stat.mtimeMs
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

module.exports = {
  ROOT,
  BACKUP_DIR,
  ensureBackupDir,
  readDatabaseUrl,
  runTool,
  timestampNow,
  listBackupFiles
};

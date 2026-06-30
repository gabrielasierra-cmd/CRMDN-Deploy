const path = require("path");
const {
  BACKUP_DIR,
  ensureBackupDir,
  readDatabaseUrl,
  runTool,
  timestampNow
} = require("./db-common");

function parseOutArg(argv) {
  const outIndex = argv.indexOf("--out");
  if (outIndex >= 0 && argv[outIndex + 1]) {
    return argv[outIndex + 1];
  }
  return null;
}

function main() {
  ensureBackupDir();
  const databaseUrl = readDatabaseUrl();
  const outArg = parseOutArg(process.argv.slice(2));
  const fileName = outArg || `crm-backup-${timestampNow()}.sql`;
  const fullPath = path.isAbsolute(fileName) ? fileName : path.join(BACKUP_DIR, fileName);

  const result = runTool(
    "pg_dump",
    ["-d", databaseUrl, "--format=plain", "--no-owner", "--no-privileges", "-f", fullPath],
    { stdio: "pipe" }
  );

  if (result.status !== 0) {
    process.stderr.write(result.stderr || "Falha ao criar backup.\n");
    process.exit(result.status || 1);
  }

  console.log(`[backup] OK: ${fullPath}`);
}

main();

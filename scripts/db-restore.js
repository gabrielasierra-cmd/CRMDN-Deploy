const fs = require("fs");
const path = require("path");
const { BACKUP_DIR, listBackupFiles, readDatabaseUrl, runTool } = require("./db-common");

function parseArgs(argv) {
  const args = {
    file: null,
    yes: argv.includes("--yes")
  };

  for (const item of argv) {
    if (item.startsWith("--")) continue;
    args.file = item;
    break;
  }

  return args;
}

function resolveBackupFile(fileArg) {
  if (fileArg) {
    const maybeAbsolute = path.isAbsolute(fileArg) ? fileArg : path.join(BACKUP_DIR, fileArg);
    if (!fs.existsSync(maybeAbsolute)) return null;
    return maybeAbsolute;
  }

  const latest = listBackupFiles()[0];
  return latest ? latest.fullPath : null;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const backupFile = resolveBackupFile(args.file);

  if (!backupFile) {
    console.error("Backup nao encontrado. Usa: npm run db:backups");
    process.exit(1);
  }

  if (!args.yes) {
    console.error("Restauro bloqueado por seguranca. Usa: npm run db:restore -- <ficheiro.sql> --yes");
    process.exit(1);
  }

  const databaseUrl = readDatabaseUrl();
  const reset = runTool(
    "psql",
    ["-v", "ON_ERROR_STOP=1", "-d", databaseUrl, "-c", "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"],
    { stdio: "pipe" }
  );

  if (reset.status !== 0) {
    process.stderr.write(reset.stderr || "Falha ao limpar base antes do restauro.\n");
    process.exit(reset.status || 1);
  }

  const result = runTool("psql", ["-v", "ON_ERROR_STOP=1", "-d", databaseUrl, "-f", backupFile], {
    stdio: "pipe"
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr || "Falha ao restaurar backup.\n");
    process.exit(result.status || 1);
  }

  console.log(`[restore] OK: ${backupFile}`);
}

main();

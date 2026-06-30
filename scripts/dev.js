const { spawn, spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const net = require("net");
const http = require("http");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const backendDir = path.join(ROOT, "backend");
const LOCAL_PG_ROOT = path.join(ROOT, ".local-postgres");
const LOCAL_PG_BIN = path.join(LOCAL_PG_ROOT, "dist", "pgsql", "bin");
const LOCAL_PG_DATA = path.join(LOCAL_PG_ROOT, "data");
const LOCAL_PG_URL = "postgresql://postgres:postgres@localhost:5432/crm";
const LOCAL_PG_MIGRATED_MARKER = path.join(LOCAL_PG_ROOT, ".migrated");
const BACKEND_PORT = 4000;

function backendCommand() {
  if (process.platform === "win32") {
    const comspec = process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe";
    return {
      command: comspec,
      args: ["/d", "/s", "/c", "npm run dev"]
    };
  }
  return {
    command: "sh",
    args: ["-lc", "npm run dev"]
  };
}

function ensureBackendInstall() {
  const backendPackage = path.join(backendDir, "package.json");
  if (!fs.existsSync(backendPackage)) {
    console.error("[dev] backend/package.json nao encontrado.");
    process.exit(1);
  }

  const backendNodeModules = path.join(backendDir, "node_modules");
  if (!fs.existsSync(backendNodeModules)) {
    console.error("[dev] Dependencias do backend em falta. Corre: cd backend && npm install");
    process.exit(1);
  }
}

function ensureBackendEnv() {
  const envPath = path.join(backendDir, ".env");
  if (fs.existsSync(envPath)) return;

  const accessSecret = crypto.randomBytes(32).toString("hex");
  const refreshSecret = crypto.randomBytes(32).toString("hex");
  const content = [
    "NODE_ENV=development",
    "PORT=4000",
    "DATABASE_URL=postgres://postgres:postgres@localhost:5432/crm",
    `JWT_ACCESS_SECRET=${accessSecret}`,
    `JWT_REFRESH_SECRET=${refreshSecret}`,
    "JWT_ACCESS_EXPIRES_IN=15m",
    "JWT_REFRESH_EXPIRES_IN=30d",
    "CORS_ORIGIN=http://localhost:5500"
  ].join("\n");

  fs.writeFileSync(envPath, content, "utf8");
  console.log("[dev] backend/.env criado automaticamente (modo desenvolvimento).");
}

function isDatabaseAlreadyExistsMessage(text) {
  const value = String(text || "").toLowerCase();
  return value.includes("already exists") || value.includes("já existe") || value.includes("ja existe");
}

function runLocalPgTool(tool, args) {
  const exe = path.join(LOCAL_PG_BIN, tool);
  const result = spawnSync(exe, args, {
    cwd: ROOT,
    stdio: "pipe",
    env: { ...process.env, PGPASSWORD: "postgres" },
    encoding: "utf8"
  });
  return result;
}

function startLocalPostgresDirectOnWindows() {
  const postgresExe = path.join(LOCAL_PG_BIN, "postgres.exe");
  if (!fs.existsSync(postgresExe)) {
    return { status: 1, stdout: "", stderr: "postgres.exe nao encontrado\n" };
  }

  try {
    const child = spawn(postgresExe, ["-D", LOCAL_PG_DATA, "-p", "5432"], {
      cwd: ROOT,
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    child.unref();
    return { status: 0, stdout: "", stderr: "" };
  } catch (error) {
    return { status: 1, stdout: "", stderr: `${error.message}\n` };
  }
}

function waitForPort(port, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    function tryConnect() {
      const socket = net.createConnection({ host: "127.0.0.1", port });
      socket.on("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`PostgreSQL nao respondeu na porta ${port}`));
          return;
        }
        setTimeout(tryConnect, 300);
      });
    }

    tryConnect();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPostgresReady(adminDbUrl, timeoutMs = 120000) {
  const started = Date.now();
  let announced = false;
  while (Date.now() - started < timeoutMs) {
    if (!announced) {
      console.log("[dev] A aguardar PostgreSQL ficar pronto para queries...");
      announced = true;
    }
    const probe = runLocalPgTool("psql.exe", ["-d", adminDbUrl, "-tAc", "SELECT 1"]);
    if (probe.status === 0 && String(probe.stdout || "").trim() === "1") {
      console.log("[dev] PostgreSQL pronto.");
      return;
    }
    await sleep(300);
  }
  throw new Error("PostgreSQL arrancou mas ainda nao aceita queries (timeout).");
}

async function waitForTcpPort(host, port, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    function attempt() {
      const socket = net.createConnection({ host, port });
      socket.on("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() - started >= timeoutMs) {
          reject(new Error(`Timeout à espera de ${host}:${port}`));
          return;
        }
        setTimeout(attempt, 250);
      });
    }
    attempt();
  });
}

function ensureLocalPostgresInstalled() {
  const postgresExe = path.join(LOCAL_PG_BIN, "postgres.exe");
  if (fs.existsSync(postgresExe)) return;

  console.error("[dev] PostgreSQL local nao encontrado em .local-postgres.");
  console.error("[dev] Falta o binario:", postgresExe);
  console.error("[dev] Pede-me para reinstalar automaticamente o PostgreSQL local.");
  process.exit(1);
}

async function ensureLocalPostgresReady() {
  ensureLocalPostgresInstalled();

  console.log("[dev] A preparar PostgreSQL local...");

  if (!fs.existsSync(path.join(LOCAL_PG_DATA, "PG_VERSION"))) {
    console.error("[dev] Data directory do PostgreSQL local nao encontrada.");
    console.error("[dev] Pede-me para inicializar automaticamente o cluster .local-postgres/data.");
    process.exit(1);
  }

  const postgresAlreadyListening = getListeningPidsOnPort(5432).length > 0;

  if (!postgresAlreadyListening) {
    const logFile = path.join(LOCAL_PG_ROOT, "postgres.log");
    const startResult = runLocalPgTool("pg_ctl.exe", ["-D", LOCAL_PG_DATA, "-l", logFile, "-o", "-p 5432", "start"]);
    if (startResult.status !== 0) {
      if (process.platform !== "win32") {
        console.error("[dev] Falha ao arrancar PostgreSQL local.");
        if (startResult.stdout) process.stdout.write(startResult.stdout);
        if (startResult.stderr) process.stderr.write(startResult.stderr);
        process.exit(1);
      }

      const fallbackResult = startLocalPostgresDirectOnWindows();
      if (fallbackResult.status !== 0) {
        console.error("[dev] Falha ao arrancar PostgreSQL local (fallback Windows).");
        if (startResult.stdout) process.stdout.write(startResult.stdout);
        if (startResult.stderr) process.stderr.write(startResult.stderr);
        if (fallbackResult.stdout) process.stdout.write(fallbackResult.stdout);
        if (fallbackResult.stderr) process.stderr.write(fallbackResult.stderr);
        process.exit(1);
      }
    }
  }

  const adminDbUrl = "postgresql://postgres:postgres@localhost:5432/postgres";
  await waitForPostgresReady(adminDbUrl, 120000);
  const dbExistsResult = runLocalPgTool("psql.exe", ["-d", adminDbUrl, "-tAc", "SELECT 1 FROM pg_database WHERE datname='crm'"]);
  if (dbExistsResult.status !== 0) {
    console.error("[dev] Falha ao verificar existencia da base crm.");
    if (dbExistsResult.stdout) process.stdout.write(dbExistsResult.stdout);
    if (dbExistsResult.stderr) process.stderr.write(dbExistsResult.stderr);
    process.exit(1);
  }

  if (String(dbExistsResult.stdout || "").trim() !== "1") {
    const createDbResult = runLocalPgTool("psql.exe", ["-d", adminDbUrl, "-v", "ON_ERROR_STOP=1", "-c", "CREATE DATABASE crm"]);
    if (createDbResult.status !== 0) {
      const combined = `${createDbResult.stdout || ""}\n${createDbResult.stderr || ""}`;
      if (!isDatabaseAlreadyExistsMessage(combined)) {
        console.error("[dev] Falha ao criar base crm.");
        if (createDbResult.stdout) process.stdout.write(createDbResult.stdout);
        if (createDbResult.stderr) process.stderr.write(createDbResult.stderr);
        process.exit(1);
      }
    }
  }

  if (!fs.existsSync(LOCAL_PG_MIGRATED_MARKER)) {
    const migrationFiles = [
      path.join(ROOT, "database", "migrations", "001_init.sql"),
      path.join(ROOT, "database", "migrations", "002_seed.sql"),
      path.join(ROOT, "database", "migrations", "003_financial.sql"),
      path.join(ROOT, "database", "migrations", "004_financial_reversal.sql"),
      path.join(ROOT, "database", "migrations", "005_stock_module.sql"),
      path.join(ROOT, "database", "migrations", "006_work_hours.sql"),
      path.join(ROOT, "database", "migrations", "007_seed_extra_employees.sql"),
      path.join(ROOT, "database", "migrations", "008_material_categories.sql"),
      path.join(ROOT, "database", "migrations", "009_video_quotes.sql"),
      path.join(ROOT, "database", "migrations", "010_compatibility_views.sql"),
      path.join(ROOT, "database", "migrations", "011_shared_workspace.sql"),
      path.join(ROOT, "database", "migrations", "012_seed_canonical_employees.sql")
    ];

    for (const file of migrationFiles) {
      const migrateResult = runLocalPgTool("psql.exe", ["-d", LOCAL_PG_URL, "-v", "ON_ERROR_STOP=1", "-f", file]);
      if (migrateResult.status !== 0) {
        console.error(`[dev] Falha a executar migration: ${path.basename(file)}`);
        if (migrateResult.stdout) process.stdout.write(migrateResult.stdout);
        if (migrateResult.stderr) process.stderr.write(migrateResult.stderr);
        process.exit(1);
      }
    }

    fs.writeFileSync(LOCAL_PG_MIGRATED_MARKER, new Date().toISOString(), "utf8");
  }
}

function waitForHttpHealth(url, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();

    function attempt() {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
          resolve();
          return;
        }
        if (Date.now() - started >= timeoutMs) {
          reject(new Error(`Timeout à espera de health endpoint: ${url}`));
          return;
        }
        setTimeout(attempt, 250);
      });

      req.on("error", () => {
        if (Date.now() - started >= timeoutMs) {
          reject(new Error(`Timeout à espera de health endpoint: ${url}`));
          return;
        }
        setTimeout(attempt, 250);
      });
    }

    attempt();
  });
}

function runPowerShell(command) {
  const candidates = [];
  if (process.env.SystemRoot) {
    candidates.push(path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"));
  }
  candidates.push("pwsh.exe");
  candidates.push("powershell.exe");

  for (const bin of candidates) {
    if (bin.includes("\\") && !fs.existsSync(bin)) continue;
    const result = spawnSync(bin, ["-NoProfile", "-Command", command], {
      cwd: ROOT,
      stdio: "pipe",
      encoding: "utf8"
    });
    if (!(result.error && result.error.code === "ENOENT")) {
      return result;
    }
  }

  return {
    status: 1,
    stdout: "",
    stderr: "PowerShell nao encontrado no sistema.\n"
  };
}

function getListeningPidsOnPort(port) {
  if (process.platform === "win32") {
    const ps = runPowerShell(
      `$procIds = Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | ` +
        "Select-Object -ExpandProperty OwningProcess -Unique; if ($procIds) { Write-Output $procIds }"
    );
    if (ps.status !== 0) return [];
    return String(ps.stdout || "")
      .split(/\r?\n/)
      .map((line) => Number(line.trim()))
      .filter((pid) => Number.isFinite(pid) && pid > 0);
  }

  const lsof = spawnSync("sh", ["-lc", `lsof -nP -iTCP:${port} -sTCP:LISTEN -t | head -n 1`], {
    cwd: ROOT,
    stdio: "pipe",
    encoding: "utf8"
  });
  return String(lsof.stdout || "")
    .split(/\r?\n/)
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isFinite(pid) && pid > 0);
}

function getProcessCommandLine(pid) {
  if (!pid) return "";
  if (process.platform === "win32") {
    const ps = runPowerShell(
      `$p = Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" -ErrorAction SilentlyContinue; ` +
        "if ($p) { Write-Output $p.CommandLine }"
    );
    return String(ps.stdout || "").trim();
  }

  const proc = spawnSync("sh", ["-lc", `ps -p ${pid} -o command= 2>/dev/null`], {
    cwd: ROOT,
    stdio: "pipe",
    encoding: "utf8"
  });
  return String(proc.stdout || "").trim();
}

function killPid(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    runPowerShell(`Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue`);
    spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      cwd: ROOT,
      stdio: "ignore"
    });
    return;
  }
  spawnSync("sh", ["-lc", `kill -TERM ${pid} >/dev/null 2>&1 || true`], {
    cwd: ROOT,
    stdio: "ignore"
  });
}

function isKnownCrmProcess(commandLine) {
  const value = String(commandLine || "").toLowerCase();
  return (
    value.includes("crmdn") ||
    value.includes("ts-node-dev") ||
    value.includes("frontend-server.js") ||
    value.includes("scripts\\dev.js") ||
    value.includes("backend\\dist\\src\\server.js")
  );
}

async function waitForPortToBeFree(port, timeoutMs = 4000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (getListeningPidsOnPort(port).length === 0) {
      return true;
    }
    await sleep(200);
  }
  return getListeningPidsOnPort(port).length === 0;
}

async function ensureBackendPortAvailable() {
  const initialPids = getListeningPidsOnPort(BACKEND_PORT);
  if (initialPids.length === 0) return;

  console.log(`[dev] Porta ${BACKEND_PORT} ocupada por PID(s) ${initialPids.join(", ")}. A limpar...`);

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const pids = getListeningPidsOnPort(BACKEND_PORT);
    if (pids.length === 0) return;

    for (const pid of pids) {
      killPid(pid);
    }

    if (await waitForPortToBeFree(BACKEND_PORT, 1500)) {
      return;
    }
  }

  const remainingPids = getListeningPidsOnPort(BACKEND_PORT);
  if (remainingPids.length === 0) return;

  const details = remainingPids.map((pid) => `${pid} (${getProcessCommandLine(pid) || "sem command line"})`);
  if (details.some((item) => !isKnownCrmProcess(item))) {
    console.error(`[dev] Porta ${BACKEND_PORT} continua ocupada por processo externo: ${details.join("; ")}`);
    console.error("[dev] Fecha esse processo externo e volta a correr npm run dev.");
    process.exit(1);
  }

  console.error(`[dev] Porta ${BACKEND_PORT} continua ocupada por processo do projeto: ${details.join("; ")}`);
  process.exit(1);
}

ensureBackendInstall();
ensureBackendEnv();

const children = [];

function start(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd || ROOT,
    stdio: "inherit",
    shell: false,
    env: { ...process.env, ...(options.env || {}) }
  });

  child.on("exit", (code) => {
    if (code !== 0) {
      console.error(`[dev] ${name} terminou com codigo ${code}.`);
      stopAll(code || 1);
      return;
    }
  });

  child.on("error", (error) => {
    console.error(`[dev] falha ao iniciar ${name}:`, error.message);
    stopAll(1);
  });

  children.push(child);
  return child;
}

function stopAll(exitCode = 0) {
  for (const child of children) {
    if (!child.killed && child.pid) {
      try {
        killPid(child.pid);
      } catch (_error) {
        // ignore
      }
    }
  }
  process.exit(exitCode);
}

function openBrowser(url) {
  try {
    if (process.platform === "win32") {
      spawnSync("cmd.exe", ["/c", "start", "", url], { stdio: "ignore" });
      return;
    }
    if (process.platform === "darwin") {
      spawnSync("open", [url], { stdio: "ignore" });
      return;
    }
    spawnSync("xdg-open", [url], { stdio: "ignore" });
  } catch (_error) {
    // Ignore browser open failures.
  }
}

async function main() {
  console.log("[dev] A preparar arranque do CRM...");
  await ensureLocalPostgresReady();
  await ensureBackendPortAvailable();
  const appOrigin = `http://localhost:${BACKEND_PORT}`;

  console.log("[dev] A iniciar CRM (frontend + API no mesmo localhost)...");
  console.log(`[dev] frontend: ${appOrigin}/index.html`);
  console.log("[dev] backend:  http://localhost:4000/api");

  const backend = backendCommand();
  start("backend", backend.command, backend.args, {
    cwd: backendDir,
    env: { CORS_ORIGIN: appOrigin }
  });

  await waitForHttpHealth(`http://127.0.0.1:${BACKEND_PORT}/api/health`, 25000);
  await waitForHttpHealth(`http://127.0.0.1:${BACKEND_PORT}/index.html`, 25000);

  console.log("");
  console.log("==============================================");
  console.log("[dev] CRM pronto.");
  console.log(`[dev] Abre no browser: ${appOrigin}/index.html`);
  console.log(`[dev] API: http://localhost:${BACKEND_PORT}/api`);
  console.log("==============================================");
  console.log("");

  if (process.env.NO_BROWSER_OPEN !== "1") {
    openBrowser(`${appOrigin}/index.html`);
  }
}

main().catch((error) => {
  console.error("[dev] erro ao iniciar:", error.message);
  stopAll(1);
});

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

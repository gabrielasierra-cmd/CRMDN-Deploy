const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

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

if (process.platform === "win32") {
  const cmd = `
$currentPid = ${process.pid}
$targets = Get-CimInstance Win32_Process | Where-Object {
  $_.ProcessId -ne $currentPid -and
  $_.CommandLine -and
  (
    (($_.Name -eq 'node.exe') -and ($_.CommandLine -match 'CRMDN|ts-node-dev|frontend-server\\.js|scripts\\\\dev\\.js')) -or
    (($_.Name -eq 'cmd.exe') -and ($_.CommandLine -match 'npm run dev|ts-node-dev'))
  )
}

if ($targets) {
  $ids = $targets | Select-Object -ExpandProperty ProcessId -Unique
  Stop-Process -Id $ids -Force
  Write-Output ('Parados: ' + ($ids -join ', '))
} else {
  Write-Output 'Nenhum processo do CRM ativo.'
}
`;
  const res = runPowerShell(cmd);
  process.stdout.write(res.stdout || "");
  process.stderr.write(res.stderr || "");
  process.exit(res.status || 0);
}

const result = spawnSync("sh", ["-lc", "pkill -f 'CRMDN|ts-node-dev|frontend-server.js|scripts/dev.js' >/dev/null 2>&1 || true; echo 'Processos CRM terminados.'"], {
  stdio: "inherit"
});
process.exit(result.status || 0);

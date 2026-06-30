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
  const ports = runPowerShell("Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in 4000,5500,5432 } | Select-Object LocalAddress,LocalPort,OwningProcess | Sort-Object LocalPort | Format-Table -AutoSize");
  const procs = runPowerShell("Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'CRMDN|ts-node-dev|frontend-server\\.js|scripts\\\\dev\\.js' } | Select-Object ProcessId,CommandLine | Format-Table -AutoSize");
  console.log("Portas (4000/5500/5432):");
  process.stdout.write((ports.stdout || "").trim() + "\n");
  console.log("\nProcessos CRM:");
  process.stdout.write((procs.stdout || "").trim() + "\n");
  process.exit(0);
}

console.log("status: use netstat/ps on this OS");

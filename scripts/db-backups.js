const { listBackupFiles } = require("./db-common");

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function main() {
  const files = listBackupFiles();
  if (!files.length) {
    console.log("Nenhum backup encontrado em database/backups.");
    return;
  }

  files.forEach((file) => {
    const date = new Date(file.mtimeMs).toLocaleString("pt-PT");
    console.log(`${file.name} | ${formatBytes(file.size)} | ${date}`);
  });
}

main();

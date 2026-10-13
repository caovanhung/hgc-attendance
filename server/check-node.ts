// Phải là import đầu tiên của server/index.ts: chạy trước khi bất kỳ module nào nạp node:sqlite.
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`[STARTUP] Cần Node.js >= 22.13 (đang chạy ${process.versions.node}). Hãy nâng cấp Node rồi chạy lại.`);
  process.exit(1);
}

export {};

const { startHeadlessServer } = require("./server/headless-runtime.js") as any;

export async function startRuntimeEntry(): Promise<void> {
  try {
    await startHeadlessServer();
  } catch (error: any) {
    console.error(`Failed to start proxy server: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  void startRuntimeEntry();
}

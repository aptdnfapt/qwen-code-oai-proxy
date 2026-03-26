const { startHeadlessServer } = require('./server/headless-runtime.js');

startHeadlessServer().catch((error) => {
  console.error(`Failed to start proxy server: ${error.message}`);
  process.exit(1);
});

const http = require('http');
const app = require('../src/app');
const { initSocketServer } = require('../src/sockets');

async function testBackend() {
  console.log('--- FITRYBE BACKEND VERIFICATION ---');

  // 1. Test Express server bootup
  const server = http.createServer(app);
  const io = initSocketServer(server);

  server.listen(0, () => {
    const port = server.address().port;
    console.log(`[PASS] Server bound successfully on test port ${port}`);

    // 2. Perform HTTP Health Check request
    http.get(`http://localhost:${port}/health`, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode === 200 && json.status === 'ok') {
            console.log('[PASS] HTTP GET /health returned status ok');
          } else {
            console.error('[FAIL] Health check unexpected response:', json);
            process.exitCode = 1;
          }
        } catch (e) {
          console.error('[FAIL] Invalid JSON from /health:', data);
          process.exitCode = 1;
        }

        // Close server
        server.close(() => {
          console.log('[PASS] Backend verification clean exit.');
          process.exit(process.exitCode || 0);
        });
      });
    }).on('error', (err) => {
      console.error('[FAIL] HTTP request error:', err);
      server.close(() => process.exit(1));
    });
  });
}

testBackend();

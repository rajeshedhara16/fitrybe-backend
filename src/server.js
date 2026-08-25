const http = require('http');
const app = require('./app');
const env = require('./config/env');
const { initSocketServer } = require('./sockets');

const httpServer = http.createServer(app);
initSocketServer(httpServer);

httpServer.listen(env.port, '0.0.0.0', () => {
  console.log(`Fitrybe backend listening on http://0.0.0.0:${env.port} [${env.nodeEnv}]`);
});

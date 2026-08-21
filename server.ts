import http from 'http';
import path from 'path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createExpressApp } from './server/app';

const app = createExpressApp();

async function startServer() {
  const portArgIndex = process.argv.indexOf('--port');
  const hostArgIndex = process.argv.indexOf('--host');
  const PORT =
    portArgIndex !== -1 && process.argv[portArgIndex + 1]
      ? parseInt(process.argv[portArgIndex + 1], 10)
      : process.env.PORT
      ? parseInt(process.env.PORT, 10)
      : 3000;
  const HOST =
    hostArgIndex !== -1 && process.argv[hostArgIndex + 1]
      ? process.argv[hostArgIndex + 1]
      : '0.0.0.0';

  const server = http.createServer(app);

  // ==========================================
  // VITE DEV / STATIC PRODUCTION SERVING
  // ==========================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          server,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, HOST, () => {
    console.log(`SANMine Multi-Provider Server running on http://${HOST}:${PORT}`);
  });
}

startServer();

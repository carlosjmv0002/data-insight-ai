import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import apiRouter from './server/routes/api';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  const maxUploadMb = parseInt(process.env.MAX_UPLOAD_SIZE_MB || '25', 10) || 25;
  const payloadLimit = `${maxUploadMb}mb`;

  app.use(express.json({ limit: payloadLimit }));
  app.use(express.urlencoded({ extended: true, limit: payloadLimit }));

  // API routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString(), maxUploadMb });
  });

  app.use('/api', apiRouter);

  // Error middleware for payload size or syntax
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err.status === 413 || err.type === 'entity.too.large') {
      return res.status(413).json({
        error: `A requisição excede o tamanho máximo permitido pelo servidor (${maxUploadMb}MB). Para aumentar esse limite em ambiente local, configure MAX_UPLOAD_SIZE_MB no arquivo .env.`
      });
    }
    next(err);
  });

  // Vite middleware for development vs static files in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DataInsight AI Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});

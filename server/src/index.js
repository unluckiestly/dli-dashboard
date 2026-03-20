import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import apiRouter from './routes/api.js';
import { initDb } from './db/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve static frontend build in production
app.use(express.static(join(__dirname, '..', '..', 'client', 'dist')));

app.use('/api', apiRouter);

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '..', '..', 'client', 'dist', 'index.html'));
});

// Init DB then start server
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`[server] running on http://localhost:${PORT}`);
  });
});

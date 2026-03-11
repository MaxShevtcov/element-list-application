import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import routes from './routes';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// API routes
app.use('/api', routes);

// Serve static frontend files in production, but only if the
// directory actually exists.  When the backend is deployed alone (e.g.
// as a separate Render service) we don't build the client, so the path
// will be missing and attempts to access it result in ENOENT errors in
// the logs.  A simple existence check avoids that noise.
const clientDistPath = path.join(__dirname, '../../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));

  // SPA fallback
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
} else {
  console.warn(`static directory not found: ${clientDistPath}, skipping`);
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;

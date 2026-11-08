import './instrument.js';
import { serve } from '@hono/node-server';
import app from './app.js';

const port = Number(process.env['PORT'] ?? 3001);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(JSON.stringify({ level: 'info', msg: 'server started', port: info.port }));
});

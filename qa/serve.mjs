// Zero-dependency local server: `npm start` → http://localhost:8080
// Serves static files and dispatches /api/* to serverless handler modules
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
};

createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);

  // 1. Dispatch /api/* to respective serverless handlers
  if (p.startsWith('/api/')) {
    let bodyStr = '';
    req.on('data', chunk => { bodyStr += chunk; });
    req.on('end', async () => {
      try {
        req.body = bodyStr ? JSON.parse(bodyStr) : {};
      } catch {
        req.body = {};
      }

      res.status = code => { res.statusCode = code; return res; };
      res.json = data => {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(res.statusCode || 200);
        res.end(JSON.stringify(data));
        return res;
      };

      const relPath = p.replace(/^\/api\//, '');
      let modulePath = join(ROOT, 'api', relPath + '.js');

      if (!existsSync(modulePath)) {
        const parts = relPath.split('/');
        if (parts.length > 1) {
          const dynamicPath = join(ROOT, 'api', parts[0], '[action].js');
          if (existsSync(dynamicPath)) {
            modulePath = dynamicPath;
            req.query = { ...(req.query || {}), action: parts[1] };
          }
        }
      }

      if (!existsSync(modulePath)) {
        res.status(404).json({ error: `API route not found: ${p}` });
        return;
      }

      try {
        const mod = await import(`file://${modulePath}?t=${Date.now()}`);
        await mod.default(req, res);
      } catch (err) {
        console.error(`[API ERROR] ${p}:`, err);
        res.status(500).json({ error: err.message || 'Internal Server Error' });
      }
    });
    return;
  }

  // 2. Static file serving
  if (p === '/') p = '/tech-blitz-jane-protocol.html';
  const file = normalize(join(ROOT, p));

  // Security guard: never serve outside the project, and never serve server-only answers
  if (!file.startsWith(ROOT) || file.includes('server-only')) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(PORT, () => console.log(`TECH BLITZ server running → http://localhost:${PORT}`));

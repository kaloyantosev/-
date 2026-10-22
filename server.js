/**
 * IRIS Pay Document Portal - Local Development Server
 * Handles static assets, SPA routes (/login, /dashboard, /:slug), and serverless API handlers.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

// Map of API routes to their local module paths
const API_ROUTES = {
  '/api/auth': './api/auth.js',
  '/api/admin': './api/admin.js',
  '/api/affiliates': './api/affiliates.js',
  '/api/custom-link': './api/custom-link.js',
  '/api/send-contract': './api/send-contract.js',
  '/api/company': './api/company.js'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // Augment res with helper methods (compatible with Vercel serverless function signatures)
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data));
    return res;
  };
  res.send = (body) => {
    res.end(body);
    return res;
  };

  // Augment req with query params
  req.query = Object.fromEntries(parsedUrl.searchParams.entries());

  // 1. Check API Routes
  const matchedApiPath = Object.keys(API_ROUTES).find(route => pathname === route || pathname === `${route}/`);
  if (matchedApiPath) {
    let bodyData = '';
    req.on('data', chunk => {
      bodyData += chunk;
    });

    req.on('end', async () => {
      if (bodyData) {
        try {
          req.body = JSON.parse(bodyData);
        } catch {
          req.body = bodyData;
        }
      } else {
        req.body = {};
      }

      try {
        const modulePath = API_ROUTES[matchedApiPath];
        const module = await import(modulePath);
        if (typeof module.default === 'function') {
          await module.default(req, res);
        } else {
          res.status(500).json({ error: 'API handler not found or invalid export.' });
        }
      } catch (err) {
        console.error(`[Server Error] in ${matchedApiPath}:`, err);
        if (!res.writableEnded) {
          res.status(500).json({ error: err.message || 'Вътрешна грешка на сървъра' });
        }
      }
    });
    return;
  }

  // 2. Direct Named Pages
  if (pathname === '/ro/login' || pathname === '/ro/login/') {
    serveFile(path.join(__dirname, 'ro', 'login.html'), res);
    return;
  }

  if (pathname === '/ro/dashboard' || pathname === '/ro/dashboard/') {
    serveFile(path.join(__dirname, 'ro', 'dashboard.html'), res);
    return;
  }

  if (pathname === '/ro' || pathname === '/ro/' || pathname === '/ro/index.html') {
    serveFile(path.join(__dirname, 'ro', 'index.html'), res);
    return;
  }

  if (pathname === '/login' || pathname === '/login/') {
    serveFile(path.join(__dirname, 'login.html'), res);
    return;
  }

  if (pathname === '/dashboard' || pathname === '/dashboard/') {
    serveFile(path.join(__dirname, 'dashboard.html'), res);
    return;
  }

  if (pathname === '/admin' || pathname === '/admin/') {
    serveFile(path.join(__dirname, 'admin.html'), res);
    return;
  }

  if (pathname === '/' || pathname === '/index.html') {
    serveFile(path.join(__dirname, 'index.html'), res);
    return;
  }

  // 3. Static Files Check (including any subpath assets)
  const safePath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(__dirname, safePath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    serveFile(filePath, res);
    return;
  }

  // If a static asset is requested from a subpath (e.g. /superhosting/style.css, /c/app.js)
  const baseFileName = path.basename(pathname);
  if (baseFileName && baseFileName.includes('.')) {
    const rootCandidate = path.join(__dirname, baseFileName);
    if (fs.existsSync(rootCandidate) && fs.statSync(rootCandidate).isFile()) {
      serveFile(rootCandidate, res);
      return;
    }
  }

  // 4. Dynamic Affiliate Referral Slugs: e.g. /tech-academy, /ro/smartbill, /c/token, /ro/c/token
  // If the path doesn't have an extension and isn't an API path, serve index.html or ro/index.html
  const ext = path.extname(pathname);
  if (!ext && !pathname.startsWith('/api/')) {
    if (pathname.startsWith('/ro/') || pathname === '/ro') {
      serveFile(path.join(__dirname, 'ro', 'index.html'), res);
    } else {
      serveFile(path.join(__dirname, 'index.html'), res);
    }
    return;
  }

  // 5. 404 Not Found
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('404 Не е намерено');
});

function serveFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.statusCode = 500;
      res.end(`Грешка при зареждане на файл: ${err.message}`);
      return;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.end(content);
  });
}

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`IRIS Pay Document Portal is running on port ${PORT}`);
  console.log(`- BG Signing:     http://localhost:${PORT}/`);
  console.log(`- BG Login:       http://localhost:${PORT}/login`);
  console.log(`- BG Dashboard:   http://localhost:${PORT}/dashboard`);
  console.log(`- RO Signing:     http://localhost:${PORT}/ro`);
  console.log(`- RO Login:       http://localhost:${PORT}/ro/login`);
  console.log(`- RO Dashboard:   http://localhost:${PORT}/ro/dashboard`);
  console.log(`- Admin Panel:    http://localhost:${PORT}/admin`);
  console.log(`=======================================================`);
});

#!/usr/bin/env node
// Sorta.Fit — Setup Wizard Server
// Zero-dependency Node.js HTTP server (built-ins only)

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const os = require('os');
const url = require('url');

const PORT = 3456;
const SETUP_DIR = __dirname;
const PROJECT_ROOT = path.resolve(SETUP_DIR, '..');

// Track runner child process
let runnerProcess = null;
let runnerPID = null;

// ─── Content-Type map ───────────────────────────────────────────────

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':  'font/ttf',
};

// ─── Helpers ────────────────────────────────────────────────────────

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function sendJSON(res, statusCode, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(statusCode, {
    ...corsHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(new Error('Invalid JSON body: ' + err.message));
      }
    });
    req.on('error', reject);
  });
}

function whichCommand(name) {
  try {
    const cmd = process.platform === 'win32' ? `where ${name}` : `which ${name}`;
    const result = execSync(cmd, { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    // `where` on Windows may return multiple lines; take the first
    return result.split(/\r?\n/)[0].trim();
  } catch {
    return null;
  }
}

function getVersion(name, cmdPath) {
  try {
    const result = execSync(`"${cmdPath}" --version`, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    // Take just the first line
    return result.split(/\r?\n/)[0].trim();
  } catch {
    return 'unknown';
  }
}

function isProcessRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function openBrowser(url) {
  const platform = os.platform();
  try {
    if (platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    } else if (platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch {
    // Silently ignore — user can open browser manually
  }
}

// ─── API Handlers ───────────────────────────────────────────────────

async function handleCheckDependencies(req, res) {
  const deps = ['git', 'node', 'claude', 'gh'];
  const results = [];

  for (const name of deps) {
    let found = false;
    let version = '';
    let depPath = '';

    let cmdPath = whichCommand(name);

    // Special case: gh may live in a non-PATH location on Windows
    if (!cmdPath && name === 'gh' && process.platform === 'win32') {
      const ghExe = '/c/Program Files/GitHub CLI/gh.exe';
      // Also try the Windows-native path
      const ghExeWin = 'C:\\Program Files\\GitHub CLI\\gh.exe';
      try {
        if (fs.existsSync(ghExeWin) || fs.existsSync(ghExe)) {
          cmdPath = fs.existsSync(ghExeWin) ? ghExeWin : ghExe;
        }
      } catch {
        // ignore
      }
    }

    if (cmdPath) {
      found = true;
      depPath = cmdPath;
      version = getVersion(name, cmdPath);
    }

    results.push({ name, found, version, path: depPath });
  }

  sendJSON(res, 200, { dependencies: results });
}

async function handleTestConnection(req, res) {
  const body = await readBody(req);
  const { adapter, domain, email, token, projectKey } = body;

  if (!adapter || !domain || !token) {
    return sendJSON(res, 400, { success: false, message: 'Missing required fields: adapter, domain, token' });
  }

  if (adapter === 'jira') {
    if (!email) {
      return sendJSON(res, 400, { success: false, message: 'Jira adapter requires email field' });
    }

    try {
      const auth = Buffer.from(`${email}:${token}`).toString('base64');
      const jiraUrl = `https://${domain}/rest/api/3/myself`;

      // Use Node built-in https
      const result = await new Promise((resolve, reject) => {
        const https = require('https');
        const parsed = new URL(jiraUrl);

        const reqOpts = {
          hostname: parsed.hostname,
          port: 443,
          path: parsed.pathname,
          method: 'GET',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json',
          },
        };

        const request = https.request(reqOpts, (response) => {
          const chunks = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf-8');
            try {
              resolve({ statusCode: response.statusCode, data: JSON.parse(raw) });
            } catch {
              resolve({ statusCode: response.statusCode, data: raw });
            }
          });
        });

        request.on('error', reject);
        request.setTimeout(15000, () => {
          request.destroy();
          reject(new Error('Request timed out'));
        });
        request.end();
      });

      if (result.statusCode === 200 && result.data && result.data.displayName) {
        sendJSON(res, 200, {
          success: true,
          message: `Connected as ${result.data.displayName}`,
          user: {
            displayName: result.data.displayName,
            emailAddress: result.data.emailAddress,
            accountId: result.data.accountId,
          },
        });
      } else {
        const msg = result.data && result.data.message
          ? result.data.message
          : `HTTP ${result.statusCode} — check credentials and domain`;
        sendJSON(res, 200, { success: false, message: msg });
      }
    } catch (err) {
      sendJSON(res, 200, { success: false, message: `Connection failed: ${err.message}` });
    }
  } else {
    sendJSON(res, 400, { success: false, message: `Adapter "${adapter}" is not yet supported in the setup wizard` });
  }
}

async function handleDiscoverBoard(req, res) {
  const body = await readBody(req);
  const { adapter, domain, email, token, projectKey } = body;

  if (!adapter || !domain || !token || !projectKey) {
    return sendJSON(res, 400, { success: false, message: 'Missing required fields' });
  }

  if (adapter === 'jira') {
    if (!email) {
      return sendJSON(res, 400, { success: false, message: 'Jira adapter requires email field' });
    }

    const auth = Buffer.from(`${email}:${token}`).toString('base64');
    const https = require('https');

    // Helper for HTTPS GET requests
    function jiraGet(urlPath) {
      return new Promise((resolve, reject) => {
        const reqOpts = {
          hostname: domain,
          port: 443,
          path: urlPath,
          method: 'GET',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json',
          },
        };

        const request = https.request(reqOpts, (response) => {
          const chunks = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf-8');
            try {
              resolve({ statusCode: response.statusCode, data: JSON.parse(raw) });
            } catch {
              resolve({ statusCode: response.statusCode, data: raw });
            }
          });
        });

        request.on('error', reject);
        request.setTimeout(15000, () => {
          request.destroy();
          reject(new Error('Request timed out'));
        });
        request.end();
      });
    }

    // Helper for HTTPS POST requests (JQL search)
    function jiraPost(urlPath, body) {
      return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const reqOpts = {
          hostname: domain,
          port: 443,
          path: urlPath,
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
        };

        const request = https.request(reqOpts, (response) => {
          const chunks = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf-8');
            try {
              resolve({ statusCode: response.statusCode, data: JSON.parse(raw) });
            } catch {
              resolve({ statusCode: response.statusCode, data: raw });
            }
          });
        });

        request.on('error', reject);
        request.setTimeout(15000, () => {
          request.destroy();
          reject(new Error('Request timed out'));
        });
        request.end(payload);
      });
    }

    try {
      // 1. Fetch project statuses
      const statusResult = await jiraGet(`/rest/api/3/project/${encodeURIComponent(projectKey)}/statuses`);

      if (statusResult.statusCode !== 200) {
        const msg = statusResult.data && statusResult.data.errorMessages
          ? statusResult.data.errorMessages.join(', ')
          : `HTTP ${statusResult.statusCode}`;
        return sendJSON(res, 200, { success: false, message: `Failed to fetch statuses: ${msg}` });
      }

      // Statuses come grouped by issue type; deduplicate
      const statusMap = new Map();
      const statusData = Array.isArray(statusResult.data) ? statusResult.data : [];
      for (const issueType of statusData) {
        if (issueType.statuses) {
          for (const s of issueType.statuses) {
            statusMap.set(s.id, { id: s.id, name: s.name });
          }
        }
      }
      const statuses = Array.from(statusMap.values());

      // 2. Fetch transitions from a sample issue
      let transitions = [];
      try {
        // Find any issue in the project
        const searchResult = await jiraPost('/rest/api/3/search/jql', {
          jql: `project=${projectKey} ORDER BY rank ASC`,
          maxResults: 1,
        });

        if (searchResult.statusCode === 200 && searchResult.data.issues && searchResult.data.issues.length > 0) {
          const issueKey = searchResult.data.issues[0].key;
          const transResult = await jiraGet(`/rest/api/3/issue/${issueKey}/transitions`);

          if (transResult.statusCode === 200 && transResult.data.transitions) {
            transitions = transResult.data.transitions.map((t) => ({
              id: t.id,
              name: t.name,
              to: t.to ? t.to.name : 'unknown',
            }));
          }
        }
      } catch {
        // Transitions are best-effort; statuses are more important
      }

      sendJSON(res, 200, { success: true, statuses, transitions });
    } catch (err) {
      sendJSON(res, 200, { success: false, message: `Discovery failed: ${err.message}` });
    }
  } else {
    sendJSON(res, 400, { success: false, message: `Adapter "${adapter}" is not yet supported for discovery` });
  }
}

async function handleSaveConfig(req, res) {
  const body = await readBody(req);
  const { env, adapterConfig, adapter } = body;

  if (!env || !adapter) {
    return sendJSON(res, 400, { success: false, message: 'Missing required fields: env, adapter' });
  }

  try {
    // 1. Write .env file to project root
    const envLines = ['# Sorta.Fit configuration', '# Generated by setup wizard', ''];
    for (const [key, value] of Object.entries(env)) {
      // Quote values that contain spaces or special characters
      const needsQuotes = /[\s#=]/.test(String(value));
      envLines.push(`${key}=${needsQuotes ? '"' + value + '"' : value}`);
    }
    envLines.push('');

    const envPath = path.join(PROJECT_ROOT, '.env');
    fs.writeFileSync(envPath, envLines.join('\n'), 'utf-8');

    // 2. Write adapter config if provided
    if (adapterConfig && Object.keys(adapterConfig).length > 0) {
      const configLines = [
        '#!/usr/bin/env bash',
        `# ${adapter} adapter configuration`,
        '# Generated by setup wizard',
        '',
      ];

      for (const [key, value] of Object.entries(adapterConfig)) {
        configLines.push(`${key}=${value}`);
      }
      configLines.push('');

      const adapterConfigPath = path.join(PROJECT_ROOT, 'adapters', `${adapter}.config.sh`);
      fs.writeFileSync(adapterConfigPath, configLines.join('\n'), 'utf-8');
    }

    sendJSON(res, 200, { success: true, message: 'Configuration saved' });
  } catch (err) {
    sendJSON(res, 500, { success: false, message: `Failed to save config: ${err.message}` });
  }
}

async function handleStartRunner(req, res) {
  // Check if already running
  if (runnerPID && isProcessRunning(runnerPID)) {
    return sendJSON(res, 200, { success: true, pid: runnerPID, message: 'Runner is already active' });
  }

  try {
    const runnerScript = path.join(PROJECT_ROOT, 'core', 'runner.sh');

    if (!fs.existsSync(runnerScript)) {
      return sendJSON(res, 500, { success: false, message: 'core/runner.sh not found' });
    }

    runnerProcess = spawn('bash', [runnerScript], {
      cwd: PROJECT_ROOT,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env },
    });

    runnerProcess.unref();
    runnerPID = runnerProcess.pid;

    sendJSON(res, 200, { success: true, pid: runnerPID });
  } catch (err) {
    sendJSON(res, 500, { success: false, message: `Failed to start runner: ${err.message}` });
  }
}

async function handleStopRunner(req, res) {
  if (!runnerPID || !isProcessRunning(runnerPID)) {
    runnerProcess = null;
    runnerPID = null;
    return sendJSON(res, 200, { success: true, message: 'Runner is not active' });
  }

  try {
    process.kill(runnerPID);
    runnerProcess = null;
    runnerPID = null;
    sendJSON(res, 200, { success: true, message: 'Runner stopped' });
  } catch (err) {
    sendJSON(res, 500, { success: false, message: `Failed to stop runner: ${err.message}` });
  }
}

async function handleRunnerStatus(req, res) {
  const running = isProcessRunning(runnerPID);

  // Clear stale PID
  if (!running) {
    runnerProcess = null;
    runnerPID = null;
  }

  sendJSON(res, 200, { running, pid: runnerPID });
}

// ─── Route table ────────────────────────────────────────────────────

const API_ROUTES = {
  '/api/check-dependencies': handleCheckDependencies,
  '/api/test-connection':    handleTestConnection,
  '/api/discover-board':     handleDiscoverBoard,
  '/api/save-config':        handleSaveConfig,
  '/api/start-runner':       handleStartRunner,
  '/api/stop-runner':        handleStopRunner,
  '/api/runner-status':      handleRunnerStatus,
};

// ─── Static file server ─────────────────────────────────────────────

function serveStaticFile(req, res, filePath) {
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      sendJSON(res, 404, { error: 'Not found' });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      ...corsHeaders(),
      'Content-Type': contentType,
      'Content-Length': stats.size,
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    stream.on('error', () => {
      res.writeHead(500);
      res.end('Internal server error');
    });
  });
}

// ─── Server ─────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  // API routes (POST only)
  if (pathname.startsWith('/api/')) {
    if (req.method !== 'POST') {
      return sendJSON(res, 405, { error: 'Method not allowed — use POST' });
    }

    const handler = API_ROUTES[pathname];
    if (!handler) {
      return sendJSON(res, 404, { error: `Unknown API endpoint: ${pathname}` });
    }

    try {
      await handler(req, res);
    } catch (err) {
      console.error(`Error in ${pathname}:`, err);
      sendJSON(res, 500, { error: err.message });
    }
    return;
  }

  // Static files (GET only)
  if (req.method !== 'GET') {
    return sendJSON(res, 405, { error: 'Method not allowed' });
  }

  // Map / to /index.html
  let filePath;
  if (pathname === '/' || pathname === '') {
    filePath = path.join(SETUP_DIR, 'index.html');
  } else {
    // Prevent directory traversal
    const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    filePath = path.join(SETUP_DIR, safePath);
  }

  // Ensure resolved path is within the setup directory
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(path.resolve(SETUP_DIR))) {
    return sendJSON(res, 403, { error: 'Forbidden' });
  }

  serveStaticFile(req, res, resolvedPath);
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Sorta.Fit setup wizard running at ${url}`);
  console.log('Press Ctrl+C to stop.\n');
  openBrowser(url);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  server.close();
  if (runnerPID && isProcessRunning(runnerPID)) {
    try {
      process.kill(runnerPID);
    } catch {
      // ignore
    }
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  server.close();
  process.exit(0);
});

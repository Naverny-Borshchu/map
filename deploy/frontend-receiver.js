#!/usr/bin/env node
/**
 * Naverny Borshchu deploy receiver.
 *
 * Крутиться на сервері як `node receiver.js` з-під systemd --user; робоча
 * копія лежить поза репозиторієм. Цей файл є джерелом правди — після зміни
 * його треба покласти на місце руками.
 *
 * Replaces the old deploy-webhook.js, which did
 *   git fetch && git reset --hard origin/main && npm ci && npm run build
 * inside the production git worktree whose build/ directory WAS the nginx
 * docroot. That design meant any build in that checkout became production
 * instantly. On 2026-08-20 a local, unmerged package.json edit redirected
 * `npm run build` to a from-scratch Vite rewrite, and prod silently became a
 * different application with no PR, no review and no Actions run.
 *
 * This receiver never builds and never touches a git checkout. GitHub Actions
 * builds the artifact and POSTs the tarball here. We verify the HMAC, unpack
 * to /var/www/<site>/releases/<sha>-<stamp>, sanity-check the tree, then flip
 * the `current` symlink atomically. Rollback is a symlink flip.
 */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const PORT = Number(process.env.PORT || 9012);
const SECRET = process.env.WEBHOOK_SECRET;
const KEEP_RELEASES = Number(process.env.KEEP_RELEASES || 5);
const MAX_BODY = 64 * 1024 * 1024;

if (!SECRET) {
  console.error('FATAL: WEBHOOK_SECRET env required');
  process.exit(1);
}

// A (repo, ref) pair may only ever write to its own site. Nothing else is
// deployable.
//
// Keyed on the repo as well as the ref on purpose: every repo has a `main`, so
// routing on the ref alone would have let a push to the landing's main install
// the landing over the production map.
const TARGETS = {
  'map:refs/heads/main':         { site: '/var/www/nb-map',     label: 'map prod  (map.navernyborshchu.com)' },
  'map:refs/heads/develop':      { site: '/var/www/nb-map1',    label: 'map dev   (map1.navernyborshchu.com)' },
  // Попередні приватні репозиторії, поки триває переїзд на монорепо.
  'frontend:refs/heads/main':    { site: '/var/www/nb-map',     label: 'map prod  (map.navernyborshchu.com)' },
  'frontend:refs/heads/develop': { site: '/var/www/nb-map1',    label: 'map dev   (map1.navernyborshchu.com)' },
  'landing:refs/heads/main':     { site: '/var/www/nb-landing', label: 'landing   (navernyborshchu.com)' },
};

/** "Naverny-Borshchu/frontend" → "frontend"; anything odd → '' (undeployable). */
const repoKey = (full) => {
  const name = String(full || '').split('/').pop();
  return /^[a-z0-9-]+$/.test(name) ? name : '';
};

const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);

function signatureFor(ref, sha, runId, body, repo = '') {
  const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
  // repo last so an older sender that omits it still verifies
  const canonical = repo
    ? `${ref}\n${sha}\n${runId}\n${bodyHash}\n${repo}`
    : `${ref}\n${sha}\n${runId}\n${bodyHash}`;
  return 'sha256=' + crypto.createHmac('sha256', SECRET).update(canonical).digest('hex');
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  // timingSafeEqual throws on length mismatch, so compare lengths first.
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * index.html must exist and every local asset it names must be present.
 *
 * Both path styles have to be accepted: the map app emits absolute
 * ("/static/js/main.abc.js") while the landing emits relative ("./index.css").
 * Only allowing absolute rejected every landing artifact with "references no
 * js/css assets", which is a confusing way to say "wrong regex".
 */
function validateTree(dir) {
  const index = path.join(dir, 'index.html');
  if (!fs.existsSync(index)) return 'no index.html in artifact';
  const html = fs.readFileSync(index, 'utf8');

  const refs = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))(?:\?[^"]*)?"/g)]
    .map((m) => m[1])
    // anything off-box is not ours to verify
    .filter((r) => !/^(?:https?:)?\/\//.test(r));

  if (refs.length === 0) return 'index.html references no local js/css assets';

  const missing = refs.filter((r) => {
    const rel = r.replace(/^\.?\//, '');
    // never let a crafted path escape the release directory
    const full = path.resolve(dir, rel);
    if (!full.startsWith(path.resolve(dir) + path.sep)) return true;
    return !fs.existsSync(full);
  });
  if (missing.length) return `artifact references missing assets: ${missing.slice(0, 3).join(', ')}`;
  return null;
}

function prune(releasesDir, keep) {
  let entries;
  try {
    entries = fs.readdirSync(releasesDir).filter((n) => {
      try { return fs.statSync(path.join(releasesDir, n)).isDirectory(); } catch { return false; }
    });
  } catch { return; }
  const live = fs.realpathSync(path.join(releasesDir, '..', 'current'));
  entries
    .map((n) => ({ n, p: path.join(releasesDir, n), t: fs.statSync(path.join(releasesDir, n)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
    .slice(keep)
    .filter((e) => e.p !== live)
    .forEach((e) => { fs.rmSync(e.p, { recursive: true, force: true }); log('pruned', e.n); });
}

function deploy(target, sha, body) {
  const releases = path.join(target.site, 'releases');
  fs.mkdirSync(releases, { recursive: true });

  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const name = `${sha.slice(0, 12)}-${stamp}`;
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'nb-deploy-'));
  const tarball = path.join(staging, 'artifact.tgz');
  const unpacked = path.join(staging, 'tree');

  try {
    fs.writeFileSync(tarball, body);
    fs.mkdirSync(unpacked);
    // Fixed argv, no shell: nothing from the request is interpolated.
    execFileSync('tar', ['-xzf', tarball, '-C', unpacked], { stdio: 'pipe', timeout: 120000 });

    // Actions may upload either the build dir's contents or the dir itself.
    let root = unpacked;
    if (!fs.existsSync(path.join(root, 'index.html'))) {
      const kids = fs.readdirSync(root).filter((n) => fs.statSync(path.join(root, n)).isDirectory());
      if (kids.length === 1 && fs.existsSync(path.join(root, kids[0], 'index.html'))) {
        root = path.join(root, kids[0]);
      }
    }

    const problem = validateTree(root);
    if (problem) return { ok: false, code: 400, msg: problem };

    const final = path.join(releases, name);
    fs.rmSync(final, { recursive: true, force: true });
    fs.renameSync(root, final);
    fs.chmodSync(final, 0o755);

    // Atomic swap: create the new link beside the old one, then rename over it.
    const link = path.join(target.site, 'current');
    const tmpLink = path.join(target.site, `.current.new.${process.pid}`);
    fs.rmSync(tmpLink, { force: true });
    fs.symlinkSync(final, tmpLink);
    fs.renameSync(tmpLink, link);

    prune(releases, KEEP_RELEASES);
    log(`deployed ${name} -> ${target.label}`);
    return { ok: true, code: 200, msg: `deployed ${name}` };
  } catch (err) {
    log('deploy failed:', err.message);
    return { ok: false, code: 500, msg: `deploy failed: ${err.message}` };
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

const server = http.createServer((req, res) => {
  const done = (code, msg) => { res.writeHead(code, { 'Content-Type': 'text/plain' }); res.end(msg + '\n'); };

  if (req.method === 'GET' && req.url === '/healthz') {
    return done(200, 'ok');
  }
  if (req.method !== 'POST' || req.url !== '/webhook') return done(404, 'not found');

  const ref = req.headers['x-nb-ref'] || '';
  const repo = String(req.headers['x-nb-repo'] || '');
  const sha = String(req.headers['x-nb-sha'] || '');
  const runId = String(req.headers['x-nb-run'] || '');
  const sig = req.headers['x-hub-signature-256'] || '';

  const chunks = [];
  let size = 0;
  let aborted = false;
  req.on('data', (c) => {
    size += c.length;
    if (size > MAX_BODY) { aborted = true; done(413, 'artifact too large'); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => {
    if (aborted) return;
    const body = Buffer.concat(chunks);

    if (!safeEqual(sig, signatureFor(ref, sha, runId, body, repo))) {
      log('rejected: bad signature for', repo, ref, sha.slice(0, 12));
      return done(403, 'forbidden');
    }
    if (!/^[0-9a-f]{40}$/.test(sha)) return done(400, 'x-nb-sha must be a 40-hex commit sha');
    const key = `${repoKey(repo)}:${ref}`;
    const target = TARGETS[key];
    if (!target) return done(400, `${key} is not deployable`);
    if (body.length === 0) return done(400, 'empty artifact');

    const r = deploy(target, sha, body);
    done(r.code, r.msg);
  });
});

server.listen(PORT, '127.0.0.1', () => log(`deploy receiver on 127.0.0.1:${PORT}`));

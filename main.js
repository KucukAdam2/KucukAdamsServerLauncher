const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');

const UA = 'MCServerLauncher/1.1 (github-project)';
let win = null;
let server = null;
const send = (ch, d) => win && !win.isDestroyed() && win.webContents.send(ch, d);

function createWindow() {
  win = new BrowserWindow({
    width: 1100, height: 760, minWidth: 900, minHeight: 640,
    backgroundColor: '#14161a', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.loadFile('index.html');
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => { stopServer(); app.quit(); });

/* ---------- yardımcılar ---------- */
async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status} -> ${url}`);
  return r.json();
}
async function downloadTo(url, dest) {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!r.ok) throw new Error(`İndirme hatası: HTTP ${r.status}`);
  const total = Number(r.headers.get('content-length')) || 0;
  let got = 0;
  const out = fs.createWriteStream(dest);
  const reader = r.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    got += value.length;
    out.write(value);
    send('progress', total ? Math.round((got / total) * 100) : -1);
  }
  await new Promise((res) => out.end(res));
  send('progress', 0);
}
const cmpVer = (a, b) => {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
};
const isRel = (v) => /^\d+\.\d+(\.\d+)?$/.test(v);
const readMeta = (dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'launcher.json'), 'utf8')); } catch { return null; } };
const modFolder = (meta, dir) => path.join(dir, meta.type === 'paper' || meta.type === 'purpur' ? 'plugins' : 'mods');
function runJava(args, cwd) {
  return new Promise((res, rej) => {
    const p = spawn('java', args, { cwd });
    p.stdout.on('data', (d) => send('log', d.toString()));
    p.stderr.on('data', (d) => send('log', d.toString()));
    p.on('error', (e) => rej(new Error('Java çalıştırılamadı: ' + e.message)));
    p.on('close', (c) => (c === 0 ? res() : rej(new Error('Kurulum hatası, kod ' + c))));
  });
}

/* ---------- Java / klasör ---------- */
ipcMain.handle('java', () => new Promise((resolve) => {
  execFile('java', ['-version'], (err, so, se) => resolve({ ok: !err, info: ((se || so || '').split('\n')[0] || '').trim() }));
}));
ipcMain.handle('default-dir', () => path.join(app.getPath('documents'), 'MinecraftServer'));
ipcMain.handle('select-folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('open-folder', (_, dir) => { if (dir) { fs.mkdirSync(dir, { recursive: true }); shell.openPath(dir); } });
ipcMain.handle('meta', (_, dir) => readMeta(dir));

/* ---------- sürüm listeleri ---------- */
const PAPER = 'https://api.papermc.io/v2/projects/paper';
const PURPUR = 'https://api.purpurmc.org/v2/purpur';
const FABRIC = 'https://meta.fabricmc.net/v2/versions';
const FORGE_PROMOS = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json';
const NEO_API = 'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge';

function neoMc(v) {
  if (/-(beta|alpha|rc|snapshot)/i.test(v)) return null;
  const p = v.split('.');
  const maj = Number(p[0]), min = Number(p[1]);
  if (maj >= 20 && maj <= 21) return min === 0 ? `1.${maj}` : `1.${maj}.${min}`;
  if (maj >= 25) return `${maj}.${min}`;
  return null;
}

ipcMain.handle('versions', async (_, type) => {
  switch (type) {
    case 'paper': return (await getJson(PAPER)).versions.filter(isRel).sort(cmpVer).reverse();
    case 'purpur': return (await getJson(PURPUR)).versions.filter(isRel).sort(cmpVer).reverse();
    case 'fabric': return (await getJson(FABRIC + '/game')).filter((v) => v.stable && isRel(v.version)).map((v) => v.version);
    case 'forge': {
      const d = await getJson(FORGE_PROMOS);
      const s = new Set();
      Object.keys(d.promos).forEach((k) => { const v = k.replace(/-(latest|recommended)$/, ''); if (isRel(v) && cmpVer(v, '1.17') >= 0) s.add(v); });
      return [...s].sort(cmpVer).reverse();
    }
    case 'neoforge': {
      const d = await getJson(NEO_API);
      const s = new Set();
      d.versions.forEach((v) => { const m = neoMc(v); if (m) s.add(m); });
      return [...s].sort(cmpVer).reverse();
    }
    default: {
      const m = await getJson('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
      return m.versions.filter((v) => v.type === 'release').map((v) => v.id);
    }
  }
});

/* ---------- sunucu kurulumu ---------- */
ipcMain.handle('download', async (_, { type, version, dir }) => {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const meta = { type, version };
    const jar = path.join(dir, 'server.jar');
    if (type === 'paper') {
      const d = await getJson(`${PAPER}/versions/${version}/builds`);
      const last = d.builds[d.builds.length - 1];
      await downloadTo(`${PAPER}/versions/${version}/builds/${last.build}/downloads/${last.downloads.application.name}`, jar);
    } else if (type === 'purpur') {
      await downloadTo(`${PURPUR}/${version}/latest/download`, jar);
    } else if (type === 'fabric') {
      const loader = (await getJson(FABRIC + '/loader')).find((l) => l.stable).version;
      const inst = (await getJson(FABRIC + '/installer')).find((i) => i.stable).version;
      await downloadTo(`${FABRIC}/loader/${version}/${loader}/${inst}/server/jar`, jar);
    } else if (type === 'forge') {
      const d = await getJson(FORGE_PROMOS);
      const fv = d.promos[`${version}-recommended`] || d.promos[`${version}-latest`];
      if (!fv) throw new Error('Bu sürüm için Forge bulunamadı.');
      const full = `${version}-${fv}`;
      const installer = path.join(dir, 'installer.jar');
      send('log', `Forge ${full} yükleyicisi indiriliyor…\n`);
      await downloadTo(`https://maven.minecraftforge.net/net/minecraftforge/forge/${full}/forge-${full}-installer.jar`, installer);
      send('log', 'Forge kuruluyor (birkaç dakika sürebilir)…\n');
      await runJava(['-jar', 'installer.jar', '--installServer'], dir);
      meta.loaderVersion = fv;
    } else if (type === 'neoforge') {
      const d = await getJson(NEO_API);
      const nv = d.versions.filter((v) => neoMc(v) === version).sort(cmpVer).pop();
      if (!nv) throw new Error('Bu sürüm için NeoForge bulunamadı.');
      const installer = path.join(dir, 'installer.jar');
      send('log', `NeoForge ${nv} yükleyicisi indiriliyor…\n`);
      await downloadTo(`https://maven.neoforged.net/releases/net/neoforged/neoforge/${nv}/neoforge-${nv}-installer.jar`, installer);
      send('log', 'NeoForge kuruluyor (birkaç dakika sürebilir)…\n');
      await runJava(['-jar', 'installer.jar', '--install-server'], dir);
      meta.loaderVersion = nv;
    } else {
      const m = await getJson('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
      const v = m.versions.find((x) => x.id === version);
      await downloadTo((await getJson(v.url)).downloads.server.url, jar);
    }
    fs.writeFileSync(path.join(dir, 'launcher.json'), JSON.stringify(meta, null, 2));
    return { ok: true, meta };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
});

/* ---------- mod / eklenti (Modrinth) ---------- */
const MR = 'https://api.modrinth.com/v2';
const LOADERS = {
  paper: ['paper', 'spigot', 'bukkit'], purpur: ['purpur', 'paper', 'spigot', 'bukkit'],
  fabric: ['fabric'], forge: ['forge'], neoforge: ['neoforge']
};
const enc = encodeURIComponent;

ipcMain.handle('mr-search', async (_, { dir, query }) => {
  try {
    const meta = readMeta(dir);
    if (!meta || !LOADERS[meta.type]) return { ok: false, error: 'Bu sunucu türü mod/eklenti desteklemiyor veya henüz kurulmadı.' };
    const isPlugin = meta.type === 'paper' || meta.type === 'purpur';
    const facets = [LOADERS[meta.type].map((l) => `categories:${l}`), [`versions:${meta.version}`]];
    if (!isPlugin) facets.push(['project_type:mod']);
    const url = `${MR}/search?query=${enc(query || '')}&facets=${enc(JSON.stringify(facets))}&limit=25&index=${query ? 'relevance' : 'downloads'}`;
    const d = await getJson(url);
    return { ok: true, hits: d.hits.map((h) => ({ id: h.project_id, title: h.title, description: h.description, downloads: h.downloads, icon: h.icon_url, author: h.author })) };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});

async function installProject(id, meta, dir, done, files) {
  if (done.has(id)) return;
  done.add(id);
  const url = `${MR}/project/${id}/version?loaders=${enc(JSON.stringify(LOADERS[meta.type]))}&game_versions=${enc(JSON.stringify([meta.version]))}`;
  const vs = await getJson(url);
  if (!vs.length) throw new Error(`${meta.version} için uyumlu sürüm bulunamadı (${id}).`);
  const v = vs.find((x) => x.version_type === 'release') || vs[0];
  const f = v.files.find((x) => x.primary) || v.files[0];
  const folder = modFolder(meta, dir);
  fs.mkdirSync(folder, { recursive: true });
  await downloadTo(f.url, path.join(folder, path.basename(f.filename)));
  files.push(f.filename);
  send('log', `[Kuruldu] ${f.filename}\n`);
  for (const dep of v.dependencies || []) {
    if (dep.dependency_type === 'required' && dep.project_id) await installProject(dep.project_id, meta, dir, done, files);
  }
}

ipcMain.handle('mr-install', async (_, { dir, id }) => {
  try {
    const meta = readMeta(dir);
    if (!meta || !LOADERS[meta.type]) throw new Error('Sunucu türü desteklemiyor.');
    const files = [];
    await installProject(id, meta, dir, new Set(), files);
    return { ok: true, files };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});

ipcMain.handle('list-mods', (_, dir) => {
  const meta = readMeta(dir);
  if (!meta || !LOADERS[meta.type]) return [];
  const folder = modFolder(meta, dir);
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder).filter((f) => f.toLowerCase().endsWith('.jar')).sort();
});
ipcMain.handle('remove-mod', (_, { dir, name }) => {
  const meta = readMeta(dir);
  if (!meta) return false;
  try { fs.unlinkSync(path.join(modFolder(meta, dir), path.basename(name))); return true; } catch { return false; }
});
ipcMain.handle('add-files', async (_, dir) => {
  const meta = readMeta(dir);
  if (!meta || !LOADERS[meta.type]) return { ok: false, error: 'Bu sunucu türü mod/eklenti desteklemiyor.' };
  const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Jar', extensions: ['jar'] }] });
  if (r.canceled) return { ok: true, files: [] };
  const folder = modFolder(meta, dir);
  fs.mkdirSync(folder, { recursive: true });
  r.filePaths.forEach((p) => fs.copyFileSync(p, path.join(folder, path.basename(p))));
  return { ok: true, files: r.filePaths.map((p) => path.basename(p)) };
});
ipcMain.handle('open-mods', (_, dir) => {
  const meta = readMeta(dir);
  if (!meta) return;
  const f = modFolder(meta, dir);
  fs.mkdirSync(f, { recursive: true });
  shell.openPath(f);
});

/* ---------- sunucuyu çalıştır ---------- */
function writeProps(dir, props) {
  const file = path.join(dir, 'server.properties');
  const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l, i, a) => l !== '' || i < a.length - 1) : [];
  for (const [k, v] of Object.entries(props)) {
    const i = lines.findIndex((l) => l.startsWith(k + '='));
    if (i >= 0) lines[i] = `${k}=${v}`; else lines.push(`${k}=${v}`);
  }
  fs.writeFileSync(file, lines.join('\n') + '\n');
}

function launchArgs(c, meta) {
  const xm = [`-Xms${c.ram}M`, `-Xmx${c.ram}M`];
  if (meta && (meta.type === 'forge' || meta.type === 'neoforge')) {
    fs.writeFileSync(path.join(c.dir, 'user_jvm_args.txt'), xm.join('\n') + '\n');
    const base = meta.type === 'forge'
      ? `libraries/net/minecraftforge/forge/${meta.version}-${meta.loaderVersion}`
      : `libraries/net/neoforged/neoforge/${meta.loaderVersion}`;
    const rel = `${base}/${process.platform === 'win32' ? 'win_args.txt' : 'unix_args.txt'}`;
    if (!fs.existsSync(path.join(c.dir, rel))) throw new Error('Forge/NeoForge kurulumu eksik görünüyor. "Sunucuyu Kur" butonuna tekrar bas.');
    return ['@user_jvm_args.txt', '@' + rel, 'nogui'];
  }
  if (!fs.existsSync(path.join(c.dir, 'server.jar'))) throw new Error('server.jar bulunamadı. Önce "Sunucuyu Kur" butonuna bas.');
  return [...xm, '-jar', 'server.jar', 'nogui'];
}

ipcMain.handle('start', (_, c) => {
  if (server) return { ok: false, error: 'Sunucu zaten çalışıyor.' };
  try {
    const args = launchArgs(c, readMeta(c.dir));
    fs.writeFileSync(path.join(c.dir, 'eula.txt'), 'eula=true\n');
    writeProps(c.dir, {
      'server-port': c.port, 'max-players': c.maxPlayers, motd: c.motd,
      gamemode: c.gamemode, difficulty: c.difficulty, 'online-mode': c.onlineMode
    });
    server = spawn('java', args, { cwd: c.dir });
  } catch (e) { server = null; return { ok: false, error: String(e.message || e) }; }
  server.stdout.on('data', (d) => send('log', d.toString()));
  server.stderr.on('data', (d) => send('log', d.toString()));
  server.on('error', (e) => { send('log', `[HATA] ${e.message} (Java kurulu mu?)\n`); server = null; send('status', 'stopped'); });
  server.on('close', (code) => { send('log', `\n[Sunucu kapandı, kod: ${code}]\n`); server = null; send('status', 'stopped'); });
  send('status', 'running');
  return { ok: true };
});

function stopServer() {
  if (!server) return;
  const s = server;
  try { s.stdin.write('stop\n'); } catch {}
  setTimeout(() => { try { s.kill(); } catch {} }, 20000);
}
ipcMain.handle('stop', () => stopServer());
ipcMain.handle('command', (_, cmd) => { if (server) server.stdin.write(cmd + '\n'); });

const $ = (id) => document.getElementById(id);
const fields = ['ram', 'port', 'maxPlayers', 'gamemode', 'difficulty', 'motd', 'type', 'duckSub', 'duckToken', 'serverIp'];
const saved = JSON.parse(localStorage.getItem('cfg') || '{}');
const HINTS = {
  vanilla: 'Saf Minecraft. Mod veya eklenti desteklemez.',
  paper: 'Hızlı sunucu. Eklenti (plugin) kurabilirsin: EssentialsX, WorldEdit, LuckPerms…',
  purpur: 'Paper tabanlı, daha fazla ayar. Eklenti (plugin) destekler.',
  fabric: 'Hafif mod yükleyici. Fabric modları kurabilirsin (çoğu mod Fabric API ister, otomatik kurulur).',
  forge: 'Klasik mod yükleyici (1.17+). Kurulum uzun sürebilir. Deneysel.',
  neoforge: 'Yeni nesil Forge (1.20.2+). Kurulum uzun sürebilir. Deneysel.'
};

function save() {
  const o = { dir: $('dir').value, version: $('version').value };
  fields.forEach((f) => (o[f] = $(f).value));
  o.onlineMode = $('onlineMode').checked; o.eula = $('eula').checked;
  localStorage.setItem('cfg', JSON.stringify(o));
}
function log(t) {
  const l = $('log'); l.textContent += t; l.scrollTop = l.scrollHeight;
  if (l.textContent.length > 200000) l.textContent = l.textContent.slice(-100000);
}
function setState(s) {
  const e = $('state'); e.textContent = s === 'running' ? 'Çalışıyor' : 'Kapalı';
  e.className = 'badge ' + (s === 'running' ? 'on' : 'off');
}
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

/* sekmeler */
document.querySelectorAll('.tab').forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === b));
    ['server', 'console', 'mods', 'address', 'settings'].forEach((t) => $('tab-' + t).classList.toggle('hidden', t !== b.dataset.tab));
    if (b.dataset.tab === 'mods') refreshMods();
  };
});

/* sürümler */
async function loadVersions() {
  $('typeHint').textContent = HINTS[$('type').value];
  $('version').innerHTML = '<option>Yükleniyor…</option>';
  try {
    const v = await api.versions($('type').value);
    $('version').innerHTML = '';
    v.forEach((x) => $('version').appendChild(el('option', '', x)));
    if (saved.version && v.includes(saved.version)) $('version').value = saved.version;
  } catch (e) { $('version').innerHTML = '<option>Alınamadı</option>'; log('[HATA] ' + e.message + '\n'); }
}

async function refreshInfo() {
  const m = await api.meta($('dir').value);
  $('info').textContent = m ? `${m.type} ${m.version}` : 'Kurulu değil';
  return m;
}

async function loadNet() {
  const n = await api.netInfo();
  const sel = $('serverIp');
  const cur = sel.value;
  sel.innerHTML = '';
  const add = (v, t) => { const o = el('option', '', t); o.value = v; sel.appendChild(o); };
  add('', 'Hepsi (önerilen)');
  n.local.forEach((l) => add(l.address, `${l.address} (${l.name})`));
  sel.value = cur;
  if (sel.selectedIndex < 0) sel.value = '';
  const box = $('localIps'); box.innerHTML = '';
  n.local.forEach((l) => box.appendChild(el('p', 'hint', `Yerel IP (aynı Wi-Fi): ${l.address}  —  ${l.name}`)));
  $('pubIp').textContent = n.pub || 'Alınamadı (internet?)';
  window.pubIp = n.pub;
  updateAddr();
}
function updateAddr() {
  const sub = $('duckSub').value.trim().toLowerCase().replace(/\.duckdns\.org$/, '');
  const host = sub ? `${sub}.duckdns.org` : (window.pubIp || 'genel-ip');
  const port = $('port').value;
  $('addr').textContent = host + (port && port !== '25565' ? ':' + port : '');
}
$('duckSub').oninput = () => { save(); updateAddr(); };
$('duckToken').oninput = save;
$('serverIp').onchange = save;
$('port').oninput = () => { save(); updateAddr(); };
$('copyAddr').onclick = () => api.copy($('addr').textContent);
$('duckBtn').onclick = async () => {
  $('duckMsg').textContent = 'Güncelleniyor…';
  const r = await api.duckdns({ sub: $('duckSub').value, token: $('duckToken').value });
  $('duckMsg').textContent = r.ok ? `✓ ${r.host} artık senin genel IP'ne bağlı. Arkadaşlarına bunu ver.` : 'Hata: ' + r.error;
  save(); updateAddr();
};

(async () => {
  $('dir').value = saved.dir || (await api.defaultDir());
  try { await loadNet(); } catch (e) { log('[HATA] ' + e.message + '\n'); }
  fields.forEach((f) => { if (saved[f] !== undefined) $(f).value = saved[f]; });
  updateAddr();
  if (saved.onlineMode !== undefined) $('onlineMode').checked = saved.onlineMode;
  if (saved.eula) $('eula').checked = true;
  const j = await api.java();
  $('java').textContent = j.ok ? 'Java ✓' : 'Java yok!';
  $('java').className = 'badge ' + (j.ok ? 'on' : 'warn');
  if (!j.ok) log('Java bulunamadı. Adoptium Temurin 21 kur: https://adoptium.net\n');
  refreshInfo();
  loadVersions();
})();

$('type').onchange = () => { save(); loadVersions(); };
$('version').onchange = save;
$('eula').onchange = save;
$('pick').onclick = async () => { const d = await api.selectFolder(); if (d) { $('dir').value = d; save(); refreshInfo(); } };
$('open').onclick = () => api.openFolder($('dir').value);

$('download').onclick = async () => {
  save();
  $('download').disabled = true;
  document.querySelector('[data-tab=console]').click();
  log(`\n=== ${$('type').value} ${$('version').value} kuruluyor ===\n`);
  const r = await api.download({ type: $('type').value, version: $('version').value, dir: $('dir').value });
  log(r.ok ? 'Kurulum tamam ✓\n' : '[HATA] ' + r.error + '\n');
  $('download').disabled = false;
  refreshInfo();
};

$('start').onclick = async () => {
  if (!$('eula').checked) { document.querySelector('[data-tab=server]').click(); return alert('Önce EULA kutusunu işaretle.'); }
  save();
  document.querySelector('[data-tab=console]').click();
  const r = await api.start({
    dir: $('dir').value, ram: $('ram').value, port: $('port').value, maxPlayers: $('maxPlayers').value,
    motd: $('motd').value, gamemode: $('gamemode').value, difficulty: $('difficulty').value, onlineMode: $('onlineMode').checked,
    serverIp: $('serverIp').value, duckSub: $('duckSub').value, duckToken: $('duckToken').value
  });
  if (!r.ok) log('[HATA] ' + r.error + '\n');
};
$('stop').onclick = () => api.stop();

function sendCmd() { const c = $('cmd').value.trim(); if (c) { api.command(c); log('> ' + c + '\n'); $('cmd').value = ''; } }
$('send').onclick = sendCmd;
$('cmd').onkeydown = (e) => { if (e.key === 'Enter') sendCmd(); };

/* mod & eklenti */
let meta = null;
async function refreshMods() {
  meta = await refreshInfo();
  const supported = meta && ['paper', 'purpur', 'fabric', 'forge', 'neoforge'].includes(meta.type);
  $('modInfo').textContent = !meta ? 'Önce "Sunucu" sekmesinden sunucuyu kur.'
    : !supported ? 'Vanilla sunucu mod/eklenti desteklemez. Paper, Fabric vb. seçip tekrar kur.'
    : `${meta.type} ${meta.version} için ${['paper', 'purpur'].includes(meta.type) ? 'eklenti (plugins/)' : 'mod (mods/)'} kuruyorsun. Sonuçlar Modrinth'ten gelir ve sürümüne uyumlu olanlarla sınırlıdır.`;
  const list = $('installed'); list.innerHTML = '';
  if (!supported) return;
  const mods = await api.listMods($('dir').value);
  if (!mods.length) list.appendChild(el('p', 'hint', 'Henüz bir şey kurulu değil.'));
  mods.forEach((name) => {
    const it = el('div', 'item'); const t = el('div', 'txt'); t.appendChild(el('div', 't', name));
    const rm = el('button', '', 'Sil');
    rm.onclick = async () => { await api.removeMod({ dir: $('dir').value, name }); refreshMods(); };
    it.append(t, rm); list.appendChild(it);
  });
}

async function doSearch() {
  const box = $('results'); box.innerHTML = ''; box.appendChild(el('p', 'hint', 'Aranıyor…'));
  const r = await api.mrSearch({ dir: $('dir').value, query: $('q').value.trim() });
  box.innerHTML = '';
  if (!r.ok) return box.appendChild(el('p', 'hint', r.error));
  if (!r.hits.length) return box.appendChild(el('p', 'hint', 'Bu sürümle uyumlu sonuç bulunamadı.'));
  r.hits.forEach((h) => {
    const it = el('div', 'item');
    if (h.icon) { const i = el('img'); i.src = h.icon; it.appendChild(i); } else it.appendChild(el('div', 'ph'));
    const t = el('div', 'txt');
    t.appendChild(el('div', 't', `${h.title}  ·  ${h.author}  ·  ${h.downloads.toLocaleString('tr-TR')} indirme`));
    t.appendChild(el('div', 'd', h.description));
    const b = el('button', 'primary', 'Kur');
    b.onclick = async () => {
      b.disabled = true; b.textContent = 'Kuruluyor…';
      const res = await api.mrInstall({ dir: $('dir').value, id: h.id });
      b.textContent = res.ok ? 'Kuruldu ✓' : 'Hata';
      if (!res.ok) { log('[HATA] ' + res.error + '\n'); alert(res.error); b.disabled = false; }
      refreshMods();
    };
    it.append(t, b); box.appendChild(it);
  });
}
$('search').onclick = doSearch;
$('q').onkeydown = (e) => { if (e.key === 'Enter') doSearch(); };
$('openMods').onclick = () => api.openMods($('dir').value);
$('addFiles').onclick = async () => {
  const r = await api.addFiles($('dir').value);
  if (!r.ok) alert(r.error); else refreshMods();
};

api.on('log', log);
api.on('status', setState);
api.on('progress', (p) => { $('bar').style.width = (p < 0 ? 50 : p) + '%'; });

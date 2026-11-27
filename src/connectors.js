/* Pull material from the viewer's own connectors: Obsidian vault, Google Drive, Notion.
   Tool names and arguments were read from the connectors' schemas; results are parsed defensively. */
const CONNECTORS = {
  vault: { server: 'Vault', label: 'Obsidian vault', hint: 'Search your notes by words, or leave blank to list them.' },
  drive: { server: 'Google Drive', label: 'Google Drive', hint: 'Search your Drive by words in the file.' },
  notion: { server: 'Notion', label: 'Notion', hint: 'Search your Notion pages by keywords.' }
};
const CONN_OFF = ['server_not_connected', 'server_not_found', 'not_in_manifest', 'blocked_by_policy', 'not_granted', 'capability_disabled', 'capability_removed', 'self_only'];
function connAvailable(key) { return !!S.mcp && S.conn[key] !== 'off' && settingsFor().sources[key] !== false; }
function connList() { return Object.keys(CONNECTORS).filter(connAvailable); }

function payloadOf(result) {
  if (!result) return '';
  let p = result.payload != null ? result.payload : result.structuredContent != null ? result.structuredContent : null;
  if (p == null && Array.isArray(result.content)) p = result.content.filter(b => b && b.type === 'text' && typeof b.text === 'string').map(b => b.text).join('\n');
  if (typeof p === 'string') { const t = p.trim(); if (t.startsWith('{') || t.startsWith('[')) { try { return JSON.parse(t); } catch (e) { } } }
  return p == null ? '' : p;
}
function textOf(p) {
  if (typeof p === 'string') return p;
  if (!p || typeof p !== 'object') return '';
  for (const k of ['text', 'content', 'fileContent', 'markdown', 'body', 'result']) if (typeof p[k] === 'string' && p[k].trim()) return p[k];
  if (Array.isArray(p.content)) return p.content.map(b => (b && typeof b.text === 'string' ? b.text : '')).join('\n');
  let best = '';
  for (const v of Object.values(p)) if (typeof v === 'string' && v.length > best.length) best = v;
  return best;
}
/* Checked once per tool at first use: if the connector's live schema no longer has an argument this page sends, stop rather than guess. */
const toolChecked = {};
async function checkTool(server, tool, input) {
  const k = server + '/' + tool; if (k in toolChecked) return toolChecked[k];
  let ok = true;
  try { const d = await S.mcp.describeTool(server, tool); const props = d && d.inputSchema && d.inputSchema.properties; if (props && typeof props === 'object') ok = Object.keys(input || {}).every(a => a in props); } catch (e) { ok = true; }
  return (toolChecked[k] = ok);
}
async function connCall(key, tool, input) {
  const c = CONNECTORS[key];
  if (typeof S.mcp.describeTool === 'function' && !(await checkTool(c.server, tool, input))) throw { userMessage: `${c.label} has changed how this tool works, so this page can't use it yet. Tell Claude in a chat so the page can be updated.` };
  try { return payloadOf(await S.mcp.callTool(c.server, tool, input)); }
  catch (e) {
    const code = e && e.code;
    if (CONN_OFF.includes(code)) { S.conn[key] = 'off'; throw { userMessage: `${c.label} is not connected for this page, so it has been hidden. Connect it in claude.ai, then reload.` }; }
    if (code === 'needs_reauth') throw { userMessage: `${c.label} needs you to sign in again in claude.ai.` };
    if (code === 'approval_required' || code === 'consent_required') throw { userMessage: `Allow ${c.label} when the page asks, then try again.` };
    if (code === 'rate_limited') throw { userMessage: `${c.label} is busy. Wait a moment and try again.` };
    throw { userMessage: `${c.label} couldn't complete that. Try again.` };
  }
}
/* Returns [{ id, title, sub }]. */
async function connSearch(key, query) {
  const q = String(query || '').trim().slice(0, 200);
  if (key === 'vault') {
    const p = q ? await connCall(key, 'search_notes', { query: q, limit: 15 }) : await connCall(key, 'list_notes', {});
    const lines = textOf(p).split('\n').map(l => l.trim()).filter(Boolean);
    let paths = q ? lines.filter(l => l.startsWith('## ')).map(l => l.slice(3).trim()) : [];
    if (!paths.length) paths = lines.map(l => l.replace(/^[#\-*\s]+/, '').trim()).filter(l => /\.md$/i.test(l));
    return paths.slice(0, 60).map(path => ({ id: path, title: path.split('/').pop().replace(/\.md$/i, ''), sub: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : 'Vault' }));
  }
  if (key === 'drive') {
    if (!q) return [];
    const p = await connCall(key, 'search_files', { query: `fullText contains '${q.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`, pageSize: 15, excludeContentSnippets: true });
    return L.arr(p && p.files, 30).filter(f => f && f.id).map(f => ({ id: String(f.id), title: L.str(f.title || f.name, 160) || 'Untitled', sub: driveKind(f.mimeType) }));
  }
  if (!q) return [];
  const p = await connCall(key, 'notion-search', { query: q, page_size: 15 });
  return L.arr(p && p.results, 30).map(r => ({ id: String((r && (r.id || r.url)) || ''), title: L.str(r && (r.title || r.name), 160) || 'Untitled', sub: L.str(r && (r.highlight || r.type), 120) })).filter(r => r.id);
}
function driveKind(m) {
  m = String(m || '');
  return m.includes('document') ? 'Doc' : m.includes('presentation') ? 'Slides' : m.includes('spreadsheet') ? 'Sheet' : m.includes('pdf') ? 'PDF' : m.startsWith('text/') ? 'Text' : 'File';
}
async function connRead(key, id) {
  const p = key === 'vault' ? await connCall(key, 'read_note', { path: id }) : key === 'drive' ? await connCall(key, 'read_file_content', { fileId: id }) : await connCall(key, 'notion-fetch', { id });
  return textOf(p);
}

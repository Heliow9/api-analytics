import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import { Activity, AlertTriangle, Cable, Clock, Download, Eye, Info, KeyRound, ListFilter, LogOut, Monitor, Power, RefreshCw, Save, Search, Server, ShieldAlert, Wifi } from 'lucide-react';
import './styles.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3333/api';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3333/ws';

const reasonMap = {
  ok: 'Conexão normal',
  no_adapter_found: 'Nenhum adaptador encontrado',
  adapter_disabled: 'Adaptador desativado',
  adapter_driver_or_hardware_issue: 'Possível falha de driver/adaptador',
  cable_or_wifi_disconnected: 'Cabo removido ou Wi‑Fi desconectado',
  network_link_disconnected: 'Link de rede desconectado',
  no_valid_ip: 'Sem IP válido',
  no_gateway: 'Sem gateway padrão',
  gateway_unreachable: 'Gateway/roteador sem resposta',
  dns_failure: 'Falha de DNS',
  no_internet_http_failure: 'Cabo conectado, mas sem internet',
  api_unreachable: 'Internet ok, API inacessível',
  high_latency: 'Latência alta',
  packet_loss: 'Perda de pacotes',
  agent_no_contact: 'Máquina desligada, sem internet ou agente parado',
  computer_restarted: 'Reinicialização detectada',
  unexpected_shutdown: 'Possível desligamento abrupto'
};

function apiClient(token) {
  return axios.create({ baseURL: API_URL, headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

function fmtSeconds(v) {
  const sec = Number(v || 0);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function elapsed(sec) {
  if (sec == null) return '-';
  const n = Number(sec || 0);
  if (n < 60) return `${n}s`;
  if (n < 3600) return `${Math.floor(n/60)}min ${n%60}s`;
  return `${Math.floor(n/3600)}h ${Math.floor((n%3600)/60)}min`;
}

function fmtDateTime(value) {
  if (!value) return '-';
  const iso = String(value).includes('T') ? String(value) : String(value).replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat('pt-BR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d);
}

function reasonLabel(d) {
  return d.reason_label || d.last_reason_label || reasonMap[d.last_reason] || d.last_reason || '-';
}

function statusLabel(device) {
  if (Number(device.agent_offline) === 1) return { label: 'Agente sem contato', cls: 'offline' };
  const s = String(device.last_status || 'unknown').toLowerCase();
  if (s === 'online' || s === 'ok') return { label: 'Online', cls: 'online' };
  if (s === 'degraded') return { label: 'Instável', cls: 'degraded' };
  return { label: 'Queda/Falha', cls: 'offline' };
}

function BoolBadge({ value, label }) {
  if (value == null) return <span className="mini neutral">{label}: -</span>;
  return <span className={`mini ${Number(value) ? 'ok' : 'bad'}`}>{label}: {Number(value) ? 'OK' : 'Falhou'}</span>;
}

function Login({ onLogin }) {
  const [email, setEmail] = useState('admin@real.local');
  const [password, setPassword] = useState('22021419');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(e) {
    e.preventDefault(); setLoading(true); setError('');
    try { const { data } = await apiClient().post('/auth/login', { email, password }); localStorage.setItem('realnet_token', data.token); onLogin(data.token); }
    catch { setError('Login inválido ou API indisponível.'); }
    finally { setLoading(false); }
  }
  return <div className="loginPage"><form className="loginCard" onSubmit={submit}>
    <div className="brand"><Cable size={34}/><div><h1>RealNet Monitor</h1><p>Controle real das quedas de conexão</p></div></div>
    <label>E-mail do administrador</label><input value={email} onChange={e=>setEmail(e.target.value)} />
    <label>Senha</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} />
    {error && <div className="error">{error}</div>}
    <button disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}</button>
    <small>Senha padrão inicial: 22021419. Troque no menu Segurança após o primeiro acesso.</small>
  </form></div>;
}

function DeviceEditor({ device, token, onSaved }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: device.title || '', employee_name: device.employee_name || '', department: device.department || '' });
  useEffect(()=> setForm({ title: device.title || '', employee_name: device.employee_name || '', department: device.department || '' }), [device.id, device.title, device.employee_name, device.department]);
  async function save() { const { data } = await apiClient(token).patch(`/devices/${device.id}`, form); onSaved(data.device); setOpen(false); }
  if (!open) return <button className="small" onClick={()=>setOpen(true)}>Identificar</button>;
  return <div className="inlineEditor">
    <input placeholder="Título da máquina" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/>
    <input placeholder="Nome da pessoa" value={form.employee_name} onChange={e=>setForm({...form,employee_name:e.target.value})}/>
    <input placeholder="Setor" value={form.department} onChange={e=>setForm({...form,department:e.target.value})}/>
    <button className="small success" onClick={save}><Save size={14}/> Salvar</button>
  </div>;
}

function DeviceDetails({ device, token }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  async function load() { setOpen(!open); if (!detail && !open) { const { data } = await apiClient(token).get(`/devices/${device.id}/detail`); setDetail(data); } }
  return <>
    <button className="small ghost" onClick={load}><Eye size={14}/> Detalhes</button>
    {open && <div className="detailsBox">
      <div className="detailsGrid">
        <div><b>Diagnóstico</b><p>{reasonLabel(device)}</p><small>{device.action_hint || 'Sem orientação adicional.'}</small></div>
        <div><b>Adaptador</b><p>{device.last_adapter_name || '-'}</p><small>{device.last_adapter_status || device.last_link_status || '-'}</small></div>
        <div><b>Rede</b><p>{device.last_connection_type || '-'} {device.last_wifi_ssid ? `· ${device.last_wifi_ssid}` : ''}</p><small>Gateway: {device.last_gateway || '-'}</small></div>
        <div><b>Boot</b><p>{fmtDateTime(device.last_boot_time)}</p><small>Uptime: {elapsed(device.last_uptime_seconds)}</small></div>
      </div>
      <div className="miniRow">
        <BoolBadge value={device.last_dns_ok} label="DNS"/><BoolBadge value={device.last_internet_ok} label="Internet"/><BoolBadge value={device.last_api_ok} label="API"/>
        <span className="mini neutral">Agente: {device.agent_version || '-'}</span>
      </div>
      {detail && <div className="historyGrid">
        <div><h4>Últimos eventos</h4><table className="smallTable"><tbody>{(detail.events || []).slice(0,5).map(e=><tr key={e.id}><td>{fmtDateTime(e.started_at)}</td><td>{e.event_label || e.event_type}</td><td>{e.probable_cause_label || e.probable_cause}</td></tr>)}</tbody></table></div>
        <div><h4>Auditoria</h4><table className="smallTable"><tbody>{(detail.audit || []).slice(0,5).map(a=><tr key={a.id}><td>{fmtDateTime(a.created_at)}</td><td>{a.event_type}</td><td>{a.message}</td></tr>)}</tbody></table></div>
      </div>}
    </div>}
  </>;
}

function Live({ token }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  async function load() { setLoading(true); try { const { data } = await apiClient(token).get('/devices'); setDevices(data.devices || []); } finally { setLoading(false); } }
  useEffect(()=>{ load(); const t=setInterval(load, 5000); return ()=>clearInterval(t); }, []);
  useEffect(()=>{ let ws; try { ws = new WebSocket(WS_URL); ws.onmessage = () => load(); } catch {} return ()=> ws && ws.close(); }, []);

  const enriched = useMemo(()=>devices.map(d => ({ ...d, _st: statusLabel(d), _reason: reasonLabel(d) })), [devices]);
  const filtered = useMemo(()=>enriched.filter(d => {
    const text = `${d.employee_name} ${d.title} ${d.department} ${d.hostname} ${d.last_ip} ${d._reason}`.toLowerCase();
    const statusOk = statusFilter === 'all' || d._st.cls === statusFilter || d.last_reason === statusFilter;
    return statusOk && text.includes(q.toLowerCase());
  }), [enriched, q, statusFilter]);

  const totals = useMemo(()=>({
    online: enriched.filter(d => d._st.cls === 'online').length,
    degraded: enriched.filter(d => d._st.cls === 'degraded').length,
    offline: enriched.filter(d => d._st.cls === 'offline').length,
    cable: enriched.filter(d => ['cable_or_wifi_disconnected','network_link_disconnected'].includes(d.last_reason)).length,
    noContact: enriched.filter(d => Number(d.agent_offline) === 1).length,
    dns: enriched.filter(d => d.last_reason === 'dns_failure').length,
    internet: enriched.filter(d => d.last_reason === 'no_internet_http_failure').length,
  }), [enriched]);

  return <>
    <div className="cards">
      <div className="card"><Monitor/><div><b>{devices.length}</b><span>Máquinas</span></div></div>
      <div className="card online"><Activity/><div><b>{totals.online}</b><span>Online</span></div></div>
      <div className="card degraded"><AlertTriangle/><div><b>{totals.degraded}</b><span>Instáveis</span></div></div>
      <div className="card offline"><Cable/><div><b>{totals.offline}</b><span>Queda/offline</span></div></div>
    </div>
    <div className="cards compact moreCards">
      <div className="card dangerMini"><Power/><div><b>{totals.noContact}</b><span>Sem contato</span></div></div>
      <div className="card dangerMini"><Cable/><div><b>{totals.cable}</b><span>Cabo/Wi‑Fi</span></div></div>
      <div className="card warnMini"><Server/><div><b>{totals.dns}</b><span>Falha DNS</span></div></div>
      <div className="card warnMini"><Wifi/><div><b>{totals.internet}</b><span>Sem internet</span></div></div>
    </div>
    <div className="panel">
      <div className="panelHead"><h2>Tempo real</h2><button className="small" onClick={load}><RefreshCw size={15}/> {loading ? 'Atualizando...' : 'Atualizar'}</button></div>
      <div className="filters toolbar">
        <label><Search size={14}/> Buscar <input placeholder="nome, máquina, IP, causa..." value={q} onChange={e=>setQ(e.target.value)} /></label>
        <label><ListFilter size={14}/> Filtro <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="all">Todos</option><option value="online">Online</option><option value="degraded">Instáveis</option><option value="offline">Queda/offline</option>
          <option value="agent_no_contact">Sem contato</option><option value="cable_or_wifi_disconnected">Cabo/Wi‑Fi</option><option value="dns_failure">DNS</option><option value="no_internet_http_failure">Sem internet</option>
        </select></label>
      </div>
      <table>
        <thead><tr><th>Status</th><th>Pessoa/Título</th><th>Máquina</th><th>IP</th><th>Latência</th><th>Perda</th><th>Último contato</th><th>Diagnóstico provável</th><th>Rede</th><th>Ações</th></tr></thead>
        <tbody>{filtered.map(d=> <tr key={d.id}>
          <td><span className={`badge ${d._st.cls}`}>{d._st.label}</span><br/><small>há {elapsed(d.seconds_since_contact)}</small></td>
          <td><b>{d.employee_name || 'Não informado'}</b><br/><small>{d.title || d.department || '-'}</small></td>
          <td>{d.hostname}<br/><small>{d.username_windows}</small></td>
          <td>{d.last_ip || '-'}</td>
          <td>{d.last_latency_ms == null ? '-' : `${d.last_latency_ms}ms`}</td>
          <td>{d.last_packet_loss == null ? '-' : `${Number(d.last_packet_loss).toFixed(2)}%`}</td>
          <td>{fmtDateTime(d.last_seen_at)}</td>
          <td><b>{d._reason}</b><br/><small>{d.action_hint || d.last_reason || '-'}</small></td>
          <td>{d.last_adapter_name || '-'}<br/><small>{d.last_connection_type || ''} {d.last_gateway ? `· GW ${d.last_gateway}` : ''}</small></td>
          <td><DeviceEditor device={d} token={token} onSaved={load}/><DeviceDetails device={d} token={token}/></td>
        </tr>)}</tbody>
      </table>
    </div>
  </>;
}

function Reports({ token }) {
  const today = new Date().toISOString().slice(0,10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [summary, setSummary] = useState(null);
  const [events, setEvents] = useState([]);
  async function load() {
    const client = apiClient(token); const params = { from, to, ...(deviceId ? {deviceId} : {}) };
    const [dev, sum, ev] = await Promise.all([client.get('/devices'), client.get('/reports/summary', { params }), client.get('/reports/events', { params })]);
    setDevices(dev.data.devices || []); setSummary(sum.data); setEvents(ev.data.events || []);
  }
  useEffect(()=>{ load(); }, []);
  async function secureCsv() {
    const params = new URLSearchParams({ from, to }); if (deviceId) params.set('deviceId', deviceId);
    const resp = await fetch(`${API_URL}/reports/events.csv?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` }});
    const blob = await resp.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'eventos_rede.csv'; a.click(); URL.revokeObjectURL(url);
  }
  return <div className="panel">
    <div className="panelHead"><h2>Relatórios</h2></div>
    <div className="filters"><label>De <input type="date" value={from} onChange={e=>setFrom(e.target.value)} /></label><label>Até <input type="date" value={to} onChange={e=>setTo(e.target.value)} /></label><label>Máquina <select value={deviceId} onChange={e=>setDeviceId(e.target.value)}><option value="">Todas</option>{devices.map(d=><option key={d.id} value={d.id}>{d.employee_name || d.title || d.hostname}</option>)}</select></label><button className="small success" onClick={load}><RefreshCw size={15}/> Gerar</button><button className="small" onClick={secureCsv}><Download size={15}/> CSV</button></div>
    {summary && <div className="cards compact"><div className="card"><b>{summary.summary?.total_events || 0}</b><span>Eventos de queda</span></div><div className="card"><b>{fmtSeconds(summary.summary?.total_seconds)}</b><span>Tempo total</span></div><div className="card"><b>{fmtSeconds(summary.summary?.max_seconds)}</b><span>Maior queda</span></div><div className="card"><b>{Math.round(summary.sampleQuality?.avg_latency_ms || 0)}ms</b><span>Latência média</span></div></div>}
    <h3>Ranking por funcionário/máquina</h3><table><thead><tr><th>Pessoa</th><th>Título</th><th>Setor</th><th>Máquina</th><th>Eventos</th><th>Tempo total</th><th>Maior queda</th></tr></thead><tbody>{summary?.byDevice?.map(d=><tr key={d.id}><td>{d.employee_name || '-'}</td><td>{d.title || '-'}</td><td>{d.department || '-'}</td><td>{d.hostname}</td><td>{d.total_events || 0}</td><td>{fmtSeconds(d.total_seconds)}</td><td>{fmtSeconds(d.max_seconds)}</td></tr>)}</tbody></table>
    <h3>Ocorrências por causa provável</h3><table><thead><tr><th>Causa</th><th>Eventos</th><th>Tempo total</th><th>Gravidade</th></tr></thead><tbody>{summary?.byCause?.map((c,i)=><tr key={i}><td>{c.probable_cause_label || c.probable_cause}</td><td>{c.total_events || 0}</td><td>{fmtSeconds(c.total_seconds)}</td><td>{c.severity || '-'}</td></tr>)}</tbody></table>
    <h3>Eventos detalhados</h3><table><thead><tr><th>Início</th><th>Fim</th><th>Duração</th><th>Pessoa</th><th>Máquina</th><th>Tipo</th><th>Causa provável</th><th>Origem</th></tr></thead><tbody>{events.map(e=><tr key={e.id}><td>{fmtDateTime(e.started_at)}</td><td>{e.ended_at ? fmtDateTime(e.ended_at) : 'Em andamento'}</td><td>{fmtSeconds(e.duration_seconds_current ?? e.duration_seconds)}</td><td>{e.employee_name || e.title || '-'}</td><td>{e.hostname}</td><td>{e.event_label || e.event_type}</td><td>{e.probable_cause_label || e.probable_cause}</td><td>{e.source || '-'}</td></tr>)}</tbody></table>
  </div>;
}

function Security({ token }) {
  const [currentPassword, setCurrent] = useState(''); const [newPassword, setNew] = useState(''); const [msg, setMsg] = useState('');
  async function change(e) { e.preventDefault(); setMsg(''); try { await apiClient(token).post('/auth/change-password', { currentPassword, newPassword }); setMsg('Senha alterada com sucesso.'); setCurrent(''); setNew(''); } catch { setMsg('Não foi possível alterar. Confira a senha atual e use no mínimo 8 caracteres.'); } }
  return <div className="panel narrow"><div className="panelHead"><h2><KeyRound/> Segurança</h2></div><form className="securityForm" onSubmit={change}><label>Senha atual</label><input type="password" value={currentPassword} onChange={e=>setCurrent(e.target.value)} /><label>Nova senha</label><input type="password" value={newPassword} onChange={e=>setNew(e.target.value)} /><button className="success">Alterar senha</button>{msg && <p>{msg}</p>}</form></div>;
}

function App() {
  const [token, setToken] = useState(localStorage.getItem('realnet_token') || ''); const [tab, setTab] = useState('live');
  if (!token) return <Login onLogin={setToken} />;
  function logout(){ localStorage.removeItem('realnet_token'); setToken(''); }
  return <div className="app"><aside><div className="logo"><Cable/><div><b>RealNet</b><span>Monitor</span></div></div><button className={tab==='live'?'active':''} onClick={()=>setTab('live')}>Tempo real</button><button className={tab==='reports'?'active':''} onClick={()=>setTab('reports')}>Relatórios</button><button className={tab==='security'?'active':''} onClick={()=>setTab('security')}>Segurança</button><button className="logout" onClick={logout}><LogOut size={16}/> Sair</button></aside><main><header><h1>{tab==='live'?'Monitoramento em tempo real':tab==='reports'?'Relatórios de conexão':'Segurança do dashboard'}</h1><p>Horários registrados em segundos, causa provável em português e evidências técnicas do agente.</p></header>{tab==='live' && <Live token={token}/>} {tab==='reports' && <Reports token={token}/>} {tab==='security' && <Security token={token}/>}</main></div>;
}

createRoot(document.getElementById('root')).render(<App />);

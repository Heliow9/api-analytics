import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import { Activity, AlertTriangle, Cable, Download, KeyRound, LogOut, Monitor, RefreshCw, Save } from 'lucide-react';
import './styles.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3333/api';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3333/ws';

function apiClient(token) {
  return axios.create({
    baseURL: API_URL,
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
}

function fmtSeconds(v) {
  const sec = Number(v || 0);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function statusLabel(device) {
  if (Number(device.agent_offline) === 1) return { label: 'Agente sem contato', cls: 'offline' };
  const s = String(device.last_status || 'unknown').toLowerCase();
  if (s === 'online' || s === 'ok') return { label: 'Online', cls: 'online' };
  if (s === 'degraded') return { label: 'Instável', cls: 'degraded' };
  return { label: 'Queda/Falha', cls: 'offline' };
}

function Login({ onLogin }) {
  const [email, setEmail] = useState('admin@real.local');
  const [password, setPassword] = useState('22021419');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const { data } = await apiClient().post('/auth/login', { email, password });
      localStorage.setItem('realnet_token', data.token);
      onLogin(data.token);
    } catch (err) {
      setError('Login inválido ou API indisponível.');
    } finally { setLoading(false); }
  }

  return <div className="loginPage">
    <form className="loginCard" onSubmit={submit}>
      <div className="brand"><Cable size={34}/><div><h1>RealNet Monitor</h1><p>Controle real das quedas de conexão</p></div></div>
      <label>E-mail do administrador</label>
      <input value={email} onChange={e=>setEmail(e.target.value)} />
      <label>Senha</label>
      <input type="password" value={password} onChange={e=>setPassword(e.target.value)} />
      {error && <div className="error">{error}</div>}
      <button disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}</button>
      <small>Senha padrão inicial: 22021419. Troque no menu Segurança após o primeiro acesso.</small>
    </form>
  </div>;
}

function DeviceEditor({ device, token, onSaved }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: device.title || '', employee_name: device.employee_name || '', department: device.department || '' });
  useEffect(()=> setForm({ title: device.title || '', employee_name: device.employee_name || '', department: device.department || '' }), [device.id]);
  async function save() {
    const { data } = await apiClient(token).patch(`/devices/${device.id}`, form);
    onSaved(data.device);
    setOpen(false);
  }
  if (!open) return <button className="small" onClick={()=>setOpen(true)}>Identificar</button>;
  return <div className="inlineEditor">
    <input placeholder="Título da máquina" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/>
    <input placeholder="Nome da pessoa" value={form.employee_name} onChange={e=>setForm({...form,employee_name:e.target.value})}/>
    <input placeholder="Setor" value={form.department} onChange={e=>setForm({...form,department:e.target.value})}/>
    <button className="small success" onClick={save}><Save size={14}/> Salvar</button>
  </div>;
}

function Live({ token }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true);
    try { const { data } = await apiClient(token).get('/devices'); setDevices(data.devices || []); }
    finally { setLoading(false); }
  }
  useEffect(()=>{ load(); const t=setInterval(load, 5000); return ()=>clearInterval(t); }, []);
  useEffect(()=>{
    let ws;
    try {
      ws = new WebSocket(WS_URL);
      ws.onmessage = () => load();
    } catch {}
    return ()=> ws && ws.close();
  }, []);

  const totals = useMemo(()=>({
    online: devices.filter(d => statusLabel(d).cls === 'online').length,
    degraded: devices.filter(d => statusLabel(d).cls === 'degraded').length,
    offline: devices.filter(d => statusLabel(d).cls === 'offline').length,
  }), [devices]);

  return <>
    <div className="cards">
      <div className="card"><Monitor/><div><b>{devices.length}</b><span>Máquinas</span></div></div>
      <div className="card online"><Activity/><div><b>{totals.online}</b><span>Online</span></div></div>
      <div className="card degraded"><AlertTriangle/><div><b>{totals.degraded}</b><span>Instáveis</span></div></div>
      <div className="card offline"><Cable/><div><b>{totals.offline}</b><span>Queda/offline</span></div></div>
    </div>
    <div className="panel">
      <div className="panelHead"><h2>Tempo real</h2><button className="small" onClick={load}><RefreshCw size={15}/> Atualizar</button></div>
      <table>
        <thead><tr><th>Status</th><th>Pessoa/Título</th><th>Máquina</th><th>IP</th><th>Latência</th><th>Perda</th><th>Último contato</th><th>Causa</th><th>Identificação</th></tr></thead>
        <tbody>{devices.map(d=>{ const st=statusLabel(d); return <tr key={d.id}>
          <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
          <td><b>{d.employee_name || 'Não informado'}</b><br/><small>{d.title || d.department || '-'}</small></td>
          <td>{d.hostname}<br/><small>{d.username_windows}</small></td>
          <td>{d.last_ip || '-'}</td>
          <td>{d.last_latency_ms == null ? '-' : `${d.last_latency_ms}ms`}</td>
          <td>{d.last_packet_loss == null ? '-' : `${d.last_packet_loss}%`}</td>
          <td>{d.last_seen_at || '-'}</td>
          <td>{d.last_reason || '-'}</td>
          <td><DeviceEditor device={d} token={token} onSaved={load}/></td>
        </tr>})}</tbody>
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
    const client = apiClient(token);
    const params = { from, to, ...(deviceId ? {deviceId} : {}) };
    const [dev, sum, ev] = await Promise.all([
      client.get('/devices'), client.get('/reports/summary', { params }), client.get('/reports/events', { params })
    ]);
    setDevices(dev.data.devices || []);
    setSummary(sum.data);
    setEvents(ev.data.events || []);
  }
  useEffect(()=>{ load(); }, []);
  function downloadCsv() {
    const params = new URLSearchParams({ from, to });
    if (deviceId) params.set('deviceId', deviceId);
    window.open(`${API_URL}/reports/events.csv?${params.toString()}&token_ignore=1`, '_blank');
    // Como CSV precisa de token, usamos fetch abaixo.
  }
  async function secureCsv() {
    const params = new URLSearchParams({ from, to });
    if (deviceId) params.set('deviceId', deviceId);
    const resp = await fetch(`${API_URL}/reports/events.csv?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` }});
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'eventos_rede.csv'; a.click(); URL.revokeObjectURL(url);
  }
  return <div className="panel">
    <div className="panelHead"><h2>Relatórios</h2></div>
    <div className="filters">
      <label>De <input type="date" value={from} onChange={e=>setFrom(e.target.value)} /></label>
      <label>Até <input type="date" value={to} onChange={e=>setTo(e.target.value)} /></label>
      <label>Máquina <select value={deviceId} onChange={e=>setDeviceId(e.target.value)}><option value="">Todas</option>{devices.map(d=><option key={d.id} value={d.id}>{d.employee_name || d.title || d.hostname}</option>)}</select></label>
      <button className="small success" onClick={load}><RefreshCw size={15}/> Gerar</button>
      <button className="small" onClick={secureCsv}><Download size={15}/> CSV</button>
    </div>
    {summary && <div className="cards compact">
      <div className="card"><b>{summary.summary?.total_events || 0}</b><span>Eventos de queda</span></div>
      <div className="card"><b>{fmtSeconds(summary.summary?.total_seconds)}</b><span>Tempo total</span></div>
      <div className="card"><b>{fmtSeconds(summary.summary?.max_seconds)}</b><span>Maior queda</span></div>
    </div>}
    <h3>Ranking por funcionário/máquina</h3>
    <table><thead><tr><th>Pessoa</th><th>Título</th><th>Setor</th><th>Máquina</th><th>Eventos</th><th>Tempo total</th><th>Maior queda</th></tr></thead>
    <tbody>{summary?.byDevice?.map(d=><tr key={d.id}><td>{d.employee_name || '-'}</td><td>{d.title || '-'}</td><td>{d.department || '-'}</td><td>{d.hostname}</td><td>{d.total_events || 0}</td><td>{fmtSeconds(d.total_seconds)}</td><td>{fmtSeconds(d.max_seconds)}</td></tr>)}</tbody></table>
    <h3>Eventos detalhados</h3>
    <table><thead><tr><th>Início</th><th>Fim</th><th>Duração</th><th>Pessoa</th><th>Máquina</th><th>Tipo</th><th>Causa provável</th></tr></thead>
    <tbody>{events.map(e=><tr key={e.id}><td>{e.started_at}</td><td>{e.ended_at || 'Em andamento'}</td><td>{fmtSeconds(e.duration_seconds_current ?? e.duration_seconds)}</td><td>{e.employee_name || e.title || '-'}</td><td>{e.hostname}</td><td>{e.event_type}</td><td>{e.probable_cause}</td></tr>)}</tbody></table>
  </div>;
}

function Security({ token }) {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [msg, setMsg] = useState('');
  async function change(e) {
    e.preventDefault(); setMsg('');
    try { await apiClient(token).post('/auth/change-password', { currentPassword, newPassword }); setMsg('Senha alterada com sucesso.'); setCurrent(''); setNew(''); }
    catch { setMsg('Não foi possível alterar. Confira a senha atual e use no mínimo 8 caracteres.'); }
  }
  return <div className="panel narrow">
    <div className="panelHead"><h2><KeyRound/> Segurança</h2></div>
    <form className="securityForm" onSubmit={change}>
      <label>Senha atual</label><input type="password" value={currentPassword} onChange={e=>setCurrent(e.target.value)} />
      <label>Nova senha</label><input type="password" value={newPassword} onChange={e=>setNew(e.target.value)} />
      <button className="success">Alterar senha</button>
      {msg && <p>{msg}</p>}
    </form>
  </div>
}

function App() {
  const [token, setToken] = useState(localStorage.getItem('realnet_token') || '');
  const [tab, setTab] = useState('live');
  if (!token) return <Login onLogin={setToken} />;
  function logout(){ localStorage.removeItem('realnet_token'); setToken(''); }
  return <div className="app">
    <aside><div className="logo"><Cable/><div><b>RealNet</b><span>Monitor</span></div></div>
      <button className={tab==='live'?'active':''} onClick={()=>setTab('live')}>Tempo real</button>
      <button className={tab==='reports'?'active':''} onClick={()=>setTab('reports')}>Relatórios</button>
      <button className={tab==='security'?'active':''} onClick={()=>setTab('security')}>Segurança</button>
      <button className="logout" onClick={logout}><LogOut size={16}/> Sair</button>
    </aside>
    <main>
      <header><h1>{tab==='live'?'Monitoramento em tempo real':tab==='reports'?'Relatórios de conexão':'Segurança do dashboard'}</h1><p>Horários registrados em segundos, com causa provável da falha.</p></header>
      {tab==='live' && <Live token={token}/>} {tab==='reports' && <Reports token={token}/>} {tab==='security' && <Security token={token}/>} 
    </main>
  </div>
}

createRoot(document.getElementById('root')).render(<App />);

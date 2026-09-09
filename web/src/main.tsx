import React, { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Lead = {
  id: string; rowNumber: number; company: string; contactName: string; email: string;
  category: string; website: string; personalization: string; status: string;
  initialSentAt: string; followUp1SentAt: string; followUp2SentAt: string;
  replyStatus: string; notes: string; optOut: boolean; lastError: string;
  updatedAt: string; previewAction: string; dueAction: string;
  hasSendEvidence: boolean; hasPendingAction: boolean;
};

type LogItem = { timestamp: string; company: string; email: string; action: string; result: string; message: string };
type Bootstrap = {
  generatedAt: string; ownerEmail: string; title: string;
  event: { name: string; date: string; location: string; organization: string };
  sender: { from: string; replyTo: string; cc: string[] };
  safety: { mode: string; sendsEnabled: boolean; dryRun: boolean; testMode: boolean; systemDisabled: boolean;
    dailyLimit: number; sentToday: number; remainingToday: number; triggerCount: number;
    configurationErrors: string[]; configurationWarnings: string[] };
  metrics: { total: number; approved: number; approvedReady: number; dueFollowUps: number; replied: number; interested: number };
  statuses: string[]; categories: string[]; statusCounts: Record<string, number>;
  leads: Lead[]; truncated: boolean; logs: LogItem[]; spreadsheetUrl: string;
};

type Preview = { action: string; to: string; cc: string[]; subject: string; body: string; warnings: string[] };
type JobSummary = { job: string; mode: string; processed: number; sent: number; dryRun: number; testSent: number;
  skipped: number; replies: number; errors: number; message: string; stoppedForLimit?: boolean; lockedOut?: boolean };

declare global {
  interface Window { google?: { script?: { run?: GoogleRunner } } }
}

type GoogleRunner = {
  withSuccessHandler(handler: (value: unknown) => void): GoogleRunner;
  withFailureHandler(handler: (error: { message?: string } | string) => void): GoogleRunner;
  [key: string]: unknown;
};

const mockLead: Lead = {
  id: 'demo-lead-001', rowNumber: 2, company: 'Demo Gaming Brand', contactName: 'Partnerships Team',
  email: 'partnerships@example.com', category: 'Gaming Peripherals', website: 'https://example.com',
  personalization: 'Your hands-on gaming products could work well in a playable demo zone', status: 'APPROVED',
  initialSentAt: '', followUp1SentAt: '', followUp2SentAt: '', replyStatus: '', notes: 'Local preview data only.',
  optOut: false, lastError: '', updatedAt: new Date().toISOString(), previewAction: 'INITIAL', dueAction: '',
  hasSendEvidence: false, hasPendingAction: false
};

const mockBootstrap: Bootstrap = {
  generatedAt: new Date().toISOString(), ownerEmail: 'taran.devx@gmail.com', title: 'Brand Outreach Console',
  event: { name: 'AsaiVerse', date: 'January 2027', location: 'India', organization: '' },
  sender: { from: 'taran@asaiverse.com', replyTo: 'taran@asaiverse.com', cc: ['ashish@asaiverse.com', 'gaurav@asaiverse.com'] },
  safety: { mode: 'DRY_RUN', sendsEnabled: false, dryRun: true, testMode: true, systemDisabled: false,
    dailyLimit: 20, sentToday: 0, remainingToday: 20, triggerCount: 0, configurationErrors: [],
    configurationWarnings: ['EVENT.NAME still contains a placeholder.', 'EVENT.ORGANIZATION still contains a placeholder.'] },
  metrics: { total: 1, approved: 1, approvedReady: 1, dueFollowUps: 0, replied: 0, interested: 0 },
  statuses: ['NEW','APPROVED','SENT','FOLLOW_UP_1','FOLLOW_UP_2','REPLIED','INTERESTED','MEETING','NEGOTIATING','CLOSED','NOT_INTERESTED','DO_NOT_CONTACT','REVIEW_REQUIRED'],
  categories: ['Gaming Peripherals','PC Hardware','Laptops','Smartphones','Consumer Electronics','Gaming Accessories','Audio','Technology Startup','SaaS / AI','Telecom / Internet','Food / FMCG','Beverage','Fashion / Streetwear','Automotive','Education / EdTech','Gaming Community','Creator / Entertainment','Other'],
  statusCounts: { APPROVED: 1 }, leads: [mockLead], truncated: false,
  logs: [{ timestamp: new Date().toISOString(), company: 'Demo Gaming Brand', email: 'partnerships@example.com', action: 'PREVIEW', result: 'SAFE', message: 'Local preview only — no message was sent.' }],
  spreadsheetUrl: 'https://docs.google.com/spreadsheets/'
};

function callServer<T>(name: string, ...args: unknown[]): Promise<T> {
  const runner = window.google?.script?.run;
  if (!runner) return mockCall<T>(name, args);
  return new Promise<T>((resolve, reject) => {
    const success = runner.withSuccessHandler((value) => resolve(value as T));
    const failure = success.withFailureHandler((error) => reject(new Error(typeof error === 'string' ? error : error?.message || 'Apps Script request failed.')));
    const method = failure[name];
    if (typeof method !== 'function') return reject(new Error(`Server method ${name} is unavailable.`));
    (method as (...values: unknown[]) => void).apply(failure, args);
  });
}

async function mockCall<T>(name: string, args: unknown[]): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, 280));
  if (name === 'uiBootstrap') return structuredClone(mockBootstrap) as T;
  if (name === 'uiPreviewLead') return {
    action: 'INITIAL', to: mockLead.email, cc: mockBootstrap.sender.cc,
    subject: `${mockLead.company} × ${mockBootstrap.event.name} — Brand Activation Opportunity`,
    body: `Hi Partnerships Team,\n\nI'm reaching out regarding ${mockBootstrap.event.name}, a two-day esports, gaming, technology, creator and entertainment event taking place in January 2027 in India.\n\nThe event brings together gamers and esports audiences in an environment designed for hands-on product demos, trials and playable brand experiences.\n\nWe're currently opening exhibition and brand activation spaces for selected brands interested in reaching this audience.\n\nWould you be open to a quick conversation?\n\nBest,\nTaran\ntaran@asaiverse.com\n\nIf you would prefer not to receive further messages about this event, reply “opt out” and we will update our list.`,
    warnings: ['Local preview data — no message can be sent from this page.']
  } as T;
  if (name === 'uiRunJob') return { job: String(args[0]), mode: 'DRY_RUN', processed: 1, sent: 0, dryRun: 1, testSent: 0, skipped: 0, replies: 0, errors: 0, message: 'Local preview completed.' } as T;
  if (name === 'uiImportLeads') return { imported: 0, skipped: [{ row: 1, value: '', reason: 'Local preview does not change data' }] } as T;
  if (name === 'uiBulkApprove') return { approved: [], rejected: [] } as T;
  if (name === 'uiSaveLead') return args[0] as T;
  if (name === 'uiEmergencyDisable') return { systemDisabled: true, deletedTriggers: 0, requestId: 'preview', warning: '' } as T;
  throw new Error(`Mock server method ${name} is unavailable.`);
}

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    shield: <><path d="M12 3 5 6v5c0 4.6 2.9 8.7 7 10 4.1-1.3 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></>,
    refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></>,
    send: <><path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>,
    upload: <><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 20h16"/></>,
    alert: <><path d="M10.3 3.7 2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    external: <><path d="M14 3h7v7M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></>,
    activity: <><path d="M3 12h4l2-8 4 16 2-8h6"/></>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></>
  };
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const statusTone = (status: string) => {
  if (['CLOSED','INTERESTED','MEETING','NEGOTIATING'].includes(status)) return 'good';
  if (['APPROVED','SENT','FOLLOW_UP_1','FOLLOW_UP_2'].includes(status)) return 'info';
  if (['DO_NOT_CONTACT','NOT_INTERESTED','REVIEW_REQUIRED'].includes(status)) return 'danger';
  if (status === 'REPLIED') return 'violet';
  return 'muted';
};

const formatDate = (value: string) => value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';

function App() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerLead, setDrawerLead] = useState<Lead | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [modal, setModal] = useState<'import'|'job'|'disable'|null>(null);
  const [importText, setImportText] = useState('');
  const [pendingJob, setPendingJob] = useState('');
  const [confirmation, setConfirmation] = useState('');

  const refresh = async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError('');
    try { setData(await callServer<Bootstrap>('uiBootstrap')); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

  const leads = useMemo(() => {
    if (!data) return [];
    const needle = query.trim().toLowerCase();
    return data.leads.filter((lead) => {
      const matchesStatus = statusFilter === 'ALL' || lead.status === statusFilter;
      const haystack = `${lead.company} ${lead.contactName} ${lead.email} ${lead.category}`.toLowerCase();
      return matchesStatus && (!needle || haystack.includes(needle));
    });
  }, [data, query, statusFilter]);

  const run = async <T,>(label: string, action: () => Promise<T>) => {
    setBusy(label); setError(''); setNotice('');
    try { return await action(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); throw e; }
    finally { setBusy(''); }
  };

  const openPreview = async (lead: Lead) => {
    try {
      const value = await run('preview', () => callServer<Preview>('uiPreviewLead', lead.id));
      setPreview(value || null);
    } catch { /* surfaced globally */ }
  };

  const approveSelected = async () => {
    try {
      const result = await run('approve', () => callServer<{approved:string[]; rejected:{id:string;message:string}[]}>('uiBulkApprove', [...selected]));
      setNotice(`${result?.approved.length || 0} lead(s) approved. ${result?.rejected.length || 0} rejected. No email was sent.`);
      setSelected(new Set()); await refresh(true);
    } catch { /* surfaced globally */ }
  };

  const submitImport = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const result = await run('import', () => callServer<{imported:number; skipped:{row:number;value:string;reason:string}[]}>('uiImportLeads', importText));
      setNotice(`${result?.imported || 0} lead(s) imported as NEW; ${result?.skipped.length || 0} skipped. Nothing was approved or emailed.`);
      setImportText(''); setModal(null); await refresh(true);
    } catch { /* surfaced globally */ }
  };

  const openJob = (job: string) => { setPendingJob(job); setConfirmation(''); setModal('job'); };
  const executeJob = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const result = await run('job', () => callServer<JobSummary>('uiRunJob', pendingJob, confirmation));
      setNotice(`${result?.job || pendingJob}: ${result?.mode}. Processed ${result?.processed || 0}; live sent ${result?.sent || 0}; dry-run candidates ${result?.dryRun || 0}; errors ${result?.errors || 0}.`);
      setModal(null); await refresh(true);
    } catch { /* surfaced globally */ }
  };

  const emergencyDisable = async () => {
    try {
      const result = await run('disable', () => callServer<{deletedTriggers:number;requestId:string}>('uiEmergencyDisable'));
      setNotice(`Kill switch enabled. ${result?.deletedTriggers || 0} owned trigger(s) removed. Request ${result?.requestId || ''}.`);
      setModal(null); await refresh(true);
    } catch { /* surfaced globally */ }
  };

  const saveLead = async (lead: Lead) => {
    try {
      await run('save', () => callServer<Lead>('uiSaveLead', lead));
      setNotice('Lead updated. No email was sent.'); setDrawerLead(null); await refresh(true);
    } catch { /* surfaced globally */ }
  };

  if (loading && !data) return <div className="app-loading"><div className="loader"/><p>Opening secure outreach console…</p></div>;

  const isLocal = !window.google?.script?.run;
  const mode = data?.safety.mode || 'UNKNOWN';
  const configurationBlocked = !!data?.safety.configurationErrors.length;
  const jobsBlocked = !!busy || !!data?.safety.systemDisabled || (mode !== 'DRY_RUN' && configurationBlocked);
  const modeLabel = data?.safety.systemDisabled ? 'SYSTEM DISABLED' : configurationBlocked && mode === 'LIVE' ? 'LIVE — CONFIGURATION BLOCKED' : mode === 'DRY_RUN' ? 'DRY RUN — DELIVERY LOCKED' : mode === 'LIVE' ? 'LIVE — MANUAL SENDS ENABLED' : mode;
  const jobPhrase = mode === 'LIVE' ? (pendingJob === 'INITIALS' ? 'SEND APPROVED' : pendingJob === 'FOLLOW_UPS' ? 'SEND FOLLOW UPS' : 'CHECK REPLIES') : mode === 'TEST' ? 'SEND TEST' : '';

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">A</div><div><strong>ASAIVERSE</strong><span>OUTREACH OPS</span></div></div>
      <nav aria-label="Primary"><a className="active" href="#overview"><Icon name="activity"/>Overview</a><a href="#leads"><Icon name="users"/>Lead control</a><a href="#activity"><Icon name="mail"/>Activity log</a></nav>
      <div className="sidebar-foot"><span className="eyebrow">Signed in</span><strong>{data?.ownerEmail || '—'}</strong><a href={data?.spreadsheetUrl} target="_blank" rel="noreferrer">Open source Sheet <Icon name="external" size={14}/></a></div>
    </aside>

    <main>
      <header className="topbar"><div><span className="eyebrow">PRIVATE OPERATOR CONSOLE</span><h1>Brand outreach control room</h1><p>{data?.event.name} · {data?.event.date} · {data?.event.location}</p></div><button className="icon-button" onClick={() => refresh()} disabled={!!busy} aria-label="Refresh dashboard"><Icon name="refresh"/></button></header>

      {isLocal && <div className="local-banner"><Icon name="alert"/><span>Local preview data. Server actions are simulated and cannot change the Sheet or send email.</span></div>}
      {error && <div className="toast error"><Icon name="alert"/><span>{error}</span><button onClick={() => setError('')}><Icon name="close" size={16}/></button></div>}
      {notice && <div className="toast success"><Icon name="check"/><span>{notice}</span><button onClick={() => setNotice('')}><Icon name="close" size={16}/></button></div>}

      <section id="overview" className="safety-card">
        <div className={`safety-icon ${data?.safety.systemDisabled ? 'danger' : 'safe'}`}><Icon name="shield" size={26}/></div>
        <div className="safety-copy"><span className="eyebrow">CURRENT DELIVERY STATE</span><h2>{modeLabel}</h2><p>{mode === 'DRY_RUN' ? 'Jobs validate eligibility and write minimal audit entries. Gmail is not read and no draft or message is created.' : data?.safety.systemDisabled ? 'The shared runtime kill switch blocks outreach jobs.' : configurationBlocked ? 'Mailbox readiness must pass before any Gmail job can run.' : 'Manual jobs can send one message per day after typed confirmation. No scheduled triggers are installed.'}</p></div>
        <div className="safety-facts"><div><span>Today</span><strong>{data?.safety.sentToday} / {data?.safety.dailyLimit}</strong></div><div><span>Triggers</span><strong>{data?.safety.triggerCount}</strong></div><div><span>CC / email</span><strong>{data?.sender.cc.length}</strong></div></div>
        <button className="danger-button" onClick={() => setModal('disable')}><Icon name="alert"/>Emergency disable</button>
      </section>

      {(data?.safety.configurationWarnings.length || data?.safety.configurationErrors.length) ? <section className="config-alert">
        <Icon name="alert"/><div><strong>Configuration needs attention before live sending</strong><p>{[...(data?.safety.configurationErrors || []), ...(data?.safety.configurationWarnings || [])].slice(0,3).join(' · ')}</p></div>
      </section> : null}

      <section className="metrics" aria-label="Campaign metrics">
        {[
          ['Total leads', data?.metrics.total || 0, 'Imported records'],
          ['Approved', data?.metrics.approved || 0, `${data?.metrics.approvedReady || 0} ready for initial`],
          ['Follow-ups due', data?.metrics.dueFollowUps || 0, 'Day 4 / Day 9 checks'],
          ['Replies', data?.metrics.replied || 0, `${data?.metrics.interested || 0} in active pipeline`],
          ['Daily capacity', data?.safety.remainingToday || 0, 'Configured attempts left']
        ].map(([label,value,caption]) => <article className="metric" key={String(label)}><span>{label}</span><strong>{value}</strong><small>{caption}</small></article>)}
      </section>

      <section className="workspace-grid">
        <div id="leads" className="panel leads-panel">
          <div className="panel-head"><div><span className="eyebrow">APPROVAL QUEUE</span><h2>Lead control</h2></div><div className="head-actions"><button className="secondary" onClick={() => setModal('import')}><Icon name="upload"/>Import list</button><button className="primary" disabled={!selected.size || !!busy} onClick={approveSelected}><Icon name="check"/>Approve {selected.size || ''}</button></div></div>
          <div className="filters"><label className="search"><Icon name="search"/><input aria-label="Search leads" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search company, email, category…"/></label><select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="ALL">All statuses</option>{data?.statuses.map((status) => <option key={status}>{status}</option>)}</select><span>{leads.length} shown</span></div>
          <div className="table-wrap"><table><thead><tr><th className="check-cell"><input aria-label="Select all visible" type="checkbox" checked={!!leads.length && leads.every((l) => selected.has(l.id))} onChange={(e) => { const next = new Set(selected); leads.forEach((l) => e.target.checked ? next.add(l.id) : next.delete(l.id)); setSelected(next); }}/></th><th>Company</th><th>Contact</th><th>Category</th><th>Status</th><th>Last activity</th><th aria-label="Actions"/></tr></thead><tbody>
            {leads.map((lead) => <tr key={lead.id} className={selected.has(lead.id) ? 'selected-row' : ''}><td className="check-cell"><input aria-label={`Select ${lead.company || lead.email}`} type="checkbox" checked={selected.has(lead.id)} onChange={(e) => { const next = new Set(selected); e.target.checked ? next.add(lead.id) : next.delete(lead.id); setSelected(next); }}/></td><td><button className="company-link" onClick={() => setDrawerLead(lead)}>{lead.company || <em>Company needed</em>}</button><small>{lead.email}</small></td><td>{lead.contactName || 'Team'}</td><td>{lead.category || 'Uncategorised'}</td><td><span className={`status ${statusTone(lead.status)}`}>{lead.status.replaceAll('_',' ')}</span>{lead.dueAction && <small className="due">{lead.dueAction.replaceAll('_',' ')} due</small>}</td><td>{formatDate(lead.updatedAt || lead.initialSentAt)}</td><td className="row-actions"><button title="Preview email" onClick={() => openPreview(lead)}><Icon name="mail"/></button><button title="Edit lead" onClick={() => setDrawerLead(lead)}><Icon name="edit"/></button></td></tr>)}
            {!leads.length && <tr><td colSpan={7} className="empty">No leads match this view.</td></tr>}
          </tbody></table></div>
          {data?.truncated && <p className="footnote">Showing the first {data.leads.length} records. Use the source Sheet for the complete list.</p>}
        </div>

        <aside className="panel run-panel"><span className="eyebrow">MANUAL OPERATIONS</span><h2>Run jobs</h2><p>Every job re-checks the Sheet, exact status gates, opt-outs, duplicate evidence and configured limits.</p><button disabled={jobsBlocked} onClick={() => openJob('INITIALS')}><Icon name="send"/><span><strong>{mode === 'DRY_RUN' ? 'Check approved leads' : 'Send approved leads'}</strong><small>Initial outreach queue</small></span></button><button disabled={jobsBlocked} onClick={() => openJob('FOLLOW_UPS')}><Icon name="refresh"/><span><strong>{mode === 'DRY_RUN' ? 'Check follow-ups' : 'Process follow-ups'}</strong><small>Day 4 and Day 9 only</small></span></button><button disabled={jobsBlocked} onClick={() => openJob('REPLIES')}><Icon name="mail"/><span><strong>{mode === 'DRY_RUN' ? 'Plan reply checks' : 'Check replies'}</strong><small>No self-message classification</small></span></button><div className="run-foot"><span>From</span><strong>{data?.sender.from}</strong><span>Always CC</span><strong>{data?.sender.cc.join(', ')}</strong></div></aside>
      </section>

      <section id="activity" className="panel activity-panel"><div className="panel-head"><div><span className="eyebrow">AUDIT TRAIL</span><h2>Recent activity</h2></div><span className="muted-text">Latest {data?.logs.length || 0} events</span></div><div className="activity-list">{data?.logs.map((item, i) => <article key={`${item.timestamp}-${i}`}><span className={`activity-dot ${statusTone(item.result)}`}/><div><strong>{item.action} · {item.result}</strong><p>{item.message}</p><small>{item.company || item.email || 'System'} · {formatDate(item.timestamp)}</small></div></article>)}{!data?.logs.length && <p className="empty">No log entries yet.</p>}</div></section>
      <footer>Sheet is the source of truth · Runtime AI: none · Generated {formatDate(data?.generatedAt || '')}</footer>
    </main>

    {preview && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Email preview"><div className="modal preview-modal"><div className="modal-head"><div><span className="eyebrow">NO MESSAGE SENT</span><h2>{preview.action.replaceAll('_',' ')} preview</h2></div><button onClick={() => setPreview(null)}><Icon name="close"/></button></div>{preview.warnings.length > 0 && <div className="preview-warning"><Icon name="alert"/><div>{preview.warnings.map((w) => <p key={w}>{w}</p>)}</div></div>}<dl><dt>To</dt><dd>{preview.to || '—'}</dd><dt>CC</dt><dd>{preview.cc.join(', ')}</dd><dt>Subject</dt><dd>{preview.subject}</dd></dl><pre>{preview.body}</pre><div className="modal-actions"><button className="secondary" onClick={() => setPreview(null)}>Close preview</button></div></div></div>}

    {modal === 'import' && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Import leads"><form className="modal" onSubmit={submitImport}><div className="modal-head"><div><span className="eyebrow">IMPORT AS NEW</span><h2>Add your email list</h2></div><button type="button" onClick={() => setModal(null)}><Icon name="close"/></button></div><p>Paste one email per line, or CSV with an <code>Email</code> header. Supported columns: Company, Contact Name, Email, Category, Website, Personalization, Notes.</p><textarea autoFocus rows={12} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={'brand@example.com\n\n— or —\n\nCompany,Email,Category\nAcme,brand@acme.com,Gaming Peripherals'}/><div className="info-line"><Icon name="shield"/>Every accepted row is created as NEW. Import never approves or emails a lead.</div><div className="modal-actions"><button type="button" className="secondary" onClick={() => setModal(null)}>Cancel</button><button type="submit" className="primary" disabled={!importText.trim() || busy === 'import'}>Import leads</button></div></form></div>}

    {modal === 'job' && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Run outreach job"><form className="modal compact" onSubmit={executeJob}><div className="modal-head"><div><span className="eyebrow">{mode}</span><h2>Run {pendingJob.toLowerCase().replace('_',' ')} job?</h2></div><button type="button" onClick={() => setModal(null)}><Icon name="close"/></button></div><p>{mode === 'DRY_RUN' ? 'This will validate and log eligible candidates. Gmail will not be read, no draft will be created, and no message will be sent.' : 'This job can access Gmail. Only rows that pass every server-side gate are eligible.'}</p>{jobPhrase && <label className="confirm-label">Type <strong>{jobPhrase}</strong> to continue<input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="off"/></label>}<div className="modal-actions"><button type="button" className="secondary" onClick={() => setModal(null)}>Cancel</button><button type="submit" className="primary" disabled={!!jobPhrase && confirmation.trim().toUpperCase() !== jobPhrase}>Run job</button></div></form></div>}

    {modal === 'disable' && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Emergency disable"><div className="modal compact"><div className="modal-head"><div><span className="eyebrow danger-text">SAFETY CONTROL</span><h2>Disable all outreach now?</h2></div><button onClick={() => setModal(null)}><Icon name="close"/></button></div><p>This enables the shared runtime kill switch, revokes the authorized trigger generation and removes outreach triggers owned by this Google account. It does not delete leads or logs.</p><div className="modal-actions"><button className="secondary" onClick={() => setModal(null)}>Cancel</button><button className="danger-button" onClick={emergencyDisable}>Enable kill switch</button></div></div></div>}

    {drawerLead && <LeadDrawer lead={drawerLead} statuses={data?.statuses || []} categories={data?.categories || []} onClose={() => setDrawerLead(null)} onSave={saveLead}/>} 
    {busy && <div className="busy-pill"><div className="loader small"/>{busy === 'preview' ? 'Generating preview' : 'Working safely'}…</div>}
  </div>;
}

function LeadDrawer({ lead, statuses, categories, onClose, onSave }: { lead: Lead; statuses: string[]; categories: string[]; onClose: () => void; onSave: (lead: Lead) => void }) {
  const [draft, setDraft] = useState({ ...lead });
  const set = <K extends keyof Lead>(key: K, value: Lead[K]) => setDraft((current) => ({ ...current, [key]: value }));
  return <div className="drawer-backdrop" role="dialog" aria-modal="true" aria-label="Edit lead"><form className="drawer" onSubmit={(e) => { e.preventDefault(); onSave(draft); }}><div className="modal-head"><div><span className="eyebrow">LEAD #{lead.rowNumber}</span><h2>{lead.company || lead.email}</h2></div><button type="button" onClick={onClose}><Icon name="close"/></button></div><div className="form-grid"><label>Company<input value={draft.company} onChange={(e) => set('company',e.target.value)} placeholder="Required before approval"/></label><label>Contact name<input value={draft.contactName} onChange={(e) => set('contactName',e.target.value)}/></label><label className="wide">Email<input type="email" value={draft.email} onChange={(e) => set('email',e.target.value)}/></label><label>Category<select value={draft.category} onChange={(e) => set('category',e.target.value)}><option value="">Select category</option>{categories.map((c) => <option key={c}>{c}</option>)}</select></label><label>Status<select value={draft.status} onChange={(e) => set('status',e.target.value)}>{statuses.map((s) => <option key={s}>{s}</option>)}</select></label><label className="wide">Website<input value={draft.website} onChange={(e) => set('website',e.target.value)} placeholder="https://…"/></label><label className="wide">Personalization<textarea rows={4} value={draft.personalization} onChange={(e) => set('personalization',e.target.value)} placeholder="Included in the initial email"/></label><label className="wide">Internal notes<textarea rows={4} value={draft.notes} onChange={(e) => set('notes',e.target.value)} placeholder="Never inserted into emails"/></label><label className="checkbox-label"><input type="checkbox" checked={draft.optOut} onChange={(e) => set('optOut',e.target.checked)}/><span><strong>Opt out</strong><small>Immediately sets DO NOT CONTACT</small></span></label></div>{lead.lastError && <div className="preview-warning"><Icon name="alert"/><p>{lead.lastError}</p></div>}<div className="evidence"><span>Initial sent <strong>{formatDate(lead.initialSentAt)}</strong></span><span>Follow-up 1 <strong>{formatDate(lead.followUp1SentAt)}</strong></span><span>Follow-up 2 <strong>{formatDate(lead.followUp2SentAt)}</strong></span></div><div className="modal-actions sticky"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button type="submit" className="primary">Save lead</button></div></form></div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);

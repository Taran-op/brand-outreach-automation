'use client';

import React, { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import readWorkbook from 'read-excel-file/universal';

type Lead = {
  id: string; rowNumber: number; company: string; contactName: string; email: string;
  category: string; website: string; personalization: string; status: string;
  initialSentAt: string; followUp1SentAt: string; followUp2SentAt: string;
  replyStatus: string; notes: string; optOut: boolean; lastError: string;
  updatedAt: string; previewAction: string; dueAction: string;
  hasSendEvidence: boolean; hasPendingAction: boolean;
};

type LogItem = { timestamp: string; company: string; email: string; action: string; result: string; message: string };
type ReplyItem = { repliedAt: string; company: string; from: string; type: string; subject: string; snippet: string; thread: string };
type Bootstrap = {
  generatedAt: string; ownerEmail: string; title: string;
  event: { name: string; date: string; location: string; organization: string };
  sender: { from: string; replyTo: string; cc: string[] };
  imports: { maxRows: number; maxFileBytes: number };
  safety: { mode: string; sendsEnabled: boolean; dryRun: boolean; testMode: boolean; systemDisabled: boolean;
    dailyLimit: number; sentToday: number; remainingToday: number; triggerCount: number;
    configurationErrors: string[]; configurationWarnings: string[]; mailboxOwner?: string; ownsMailbox?: boolean };
  metrics: { total: number; approved: number; approvedReady: number; dueFollowUps: number; replied: number; interested: number };
  statuses: string[]; categories: string[]; statusCounts: Record<string, number>;
  leads: Lead[]; truncated: boolean; logs: LogItem[]; spreadsheetUrl: string;
  replies: { tab: string; items: ReplyItem[] };
};

type Preview = { action: string; to: string; cc: string[]; subject: string; body: string; warnings: string[] };
type JobSummary = { job: string; mode: string; processed: number; sent: number; dryRun: number; testSent: number;
  skipped: number; replies: number; errors: number; message: string; stoppedForLimit?: boolean; lockedOut?: boolean;
  stoppedForTime?: boolean; remaining?: number; found?: number; added?: number };

/**
 * Research and sending run in bursts sized to the server's time limit, and
 * the console keeps pressing on the operator's behalf while the server
 * reports work remaining. The bound keeps a server that never reports zero
 * from looping forever.
 */
const MAX_BURSTS = 40;
type ImportResult = { imported: number; withoutEmail: number; skipped: { row: number; value: string; reason: string }[] };
type WorkbookSheet = { name: string; rows: string[][] };
type WorkbookUpload = { fileName: string; fileBytes: number; sheets: WorkbookSheet[] };

/**
 * Endpoints this console can reach, each declaring its own method.
 *
 * The method is declared rather than inferred from whether a call has
 * arguments. An action that takes none is still an action, and guessing GET
 * for it sent enrichment and emergency disable to POST-only handlers.
 */
type Route = { path: string; method: 'GET' | 'POST' };

const SERVER_ROUTES: Record<string, Route> = {
  uiBootstrap: { path: '/api/console/bootstrap', method: 'GET' },
  uiPreviewLead: { path: '/api/console/preview', method: 'POST' },
  uiSaveLead: { path: '/api/console/lead', method: 'POST' },
  uiBulkApprove: { path: '/api/console/approve', method: 'POST' },
  uiImportLeads: { path: '/api/console/import', method: 'POST' },
  uiImportWorkbook: { path: '/api/console/import-workbook', method: 'POST' },
  uiRunJob: { path: '/api/console/job', method: 'POST' },
  uiEmergencyDisable: { path: '/api/console/disable', method: 'POST' },
  uiEnrichLeads: { path: '/api/console/enrich', method: 'POST' },
  uiSendTest: { path: '/api/console/test-send', method: 'POST' },
  uiRunPipeline: { path: '/api/console/pipeline', method: 'POST' },
  uiDiscoverBrands: { path: '/api/console/discover', method: 'POST' },
  uiVerifyRouting: { path: '/api/console/verify-routing', method: 'POST' },
  uiDeleteLeads: { path: '/api/console/delete', method: 'POST' }
};

/**
 * Every server call goes to a Next.js route handler that re-checks the operator
 * allowlist. Calls with no ported route fail loudly instead of resolving, so the
 * UI can never imply a write that did not happen.
 */
async function callServer<T>(name: string, ...args: unknown[]): Promise<T> {
  const route = SERVER_ROUTES[name];
  if (!route) {
    throw new Error(
      `"${name}" is not available in this console yet — it still runs in the Apps Script deployment.`
    );
  }

  // A POST route always gets a body, even an empty args array, so the handler
  // can parse it uniformly.
  const sendsBody = route.method === 'POST';
  const response = await fetch(route.path, {
    method: route.method,
    headers: sendsBody ? { 'Content-Type': 'application/json' } : undefined,
    body: sendsBody ? JSON.stringify({ args }) : undefined,
    cache: 'no-store'
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // A non-JSON body means an infrastructure error page, not an API response.
  }

  if (!response.ok) {
    const message = (payload as { error?: string } | null)?.error;
    if (response.status === 401 || response.status === 403) {
      throw new Error(message || 'Your Google session is no longer valid. Sign in again.');
    }
    throw new Error(message || `Request failed (${response.status}).`);
  }

  return payload as T;
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

/** A human reply is the good news; an opt-out or a bounce is not. */
const replyTone = (type: string) => {
  const label = type.toLowerCase();
  if (label.startsWith('reply')) return 'violet';
  if (label.startsWith('opt')) return 'danger';
  if (label.startsWith('bounce')) return 'danger';
  return 'muted';
};

const formatDate = (value: string) => value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';

const workbookCellToText = (cell: unknown) => {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) return cell.toISOString();
  if (typeof cell === 'string' || typeof cell === 'number' || typeof cell === 'boolean') return String(cell);
  return '';
};

const formatFileSize = (bytes: number) => bytes < 1024 * 1024
  ? `${Math.max(1, Math.round(bytes / 1024))} KB`
  : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

function App() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerLead, setDrawerLead] = useState<Lead | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [modal, setModal] = useState<'import'|'job'|'disable'|null>(null);
  const [importText, setImportText] = useState('');
  const [workbookUpload, setWorkbookUpload] = useState<WorkbookUpload | null>(null);
  const [workbookSheetName, setWorkbookSheetName] = useState('');
  const [dragActive, setDragActive] = useState(false);
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
    finally { setBusy(''); setProgress(''); }
  };

  /** Researches until the server reports nothing queued (or the burst bound). */
  const researchAll = async () => {
    let researched = 0, found = 0, remaining = 0, bursts = 0, message = '';
    do {
      setProgress(bursts ? `Researching… ${researched} done, ${found} address(es) found, ${remaining} queued` : 'Researching companies…');
      const result = await callServer<JobSummary>('uiEnrichLeads');
      researched += result?.processed || 0;
      found += result?.found || 0;
      remaining = result?.remaining || 0;
      message = result?.message || '';
      bursts += 1;
    } while (remaining > 0 && bursts < MAX_BURSTS);
    const summary = bursts > 1
      ? `${researched} researched over ${bursts} bursts, ${found} address(es) found${remaining ? `; ${remaining} still queued — press Research companies again` : ''}. Rows stay NEW — review and approve before anything is sent.`
      : message || 'Research finished.';
    return { researched, found, remaining, bursts, summary };
  };

  const openPreview = async (lead: Lead) => {
    try {
      const value = await run('preview', () => callServer<Preview>('uiPreviewLead', lead.id));
      setPreview(value || null);
    } catch { /* surfaced globally */ }
  };

  const deleteSelected = async () => {
    const count = selected.size;
    if (!count) return;
    if (!window.confirm(`Delete ${count} lead(s) from the Sheet? Leads that were emailed or opted out are kept automatically.`)) return;
    try {
      const result = await run('delete', () => callServer<{deleted:string[]; refused:{id:string;message:string}[]}>('uiDeleteLeads', [...selected]));
      // Refusals are deliberate and each has a reason; show them grouped
      // rather than as a bare count.
      const reasons = new Map<string, number>();
      (result?.refused || []).forEach((entry) => reasons.set(entry.message, (reasons.get(entry.message) || 0) + 1));
      const why = [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([message, n]) => `${n}: ${message}`).join(' · ');
      setNotice(`${result?.deleted.length || 0} lead(s) deleted. ${result?.refused.length || 0} kept${why ? ` — ${why}` : ''}.`);
      setSelected(new Set()); setDrawerLead(null); await refresh(true);
    } catch { /* surfaced globally */ }
  };

  const approveSelected = async () => {
    try {
      const result = await run('approve', () => callServer<{approved:string[]; rejected:{id:string;message:string}[]}>('uiBulkApprove', [...selected]));
      // A count alone hides the reason, and every refusal has one. Group them
      // so "49 rejected" reads as "49: a valid single email is required".
      const reasons = new Map<string, number>();
      (result?.rejected || []).forEach((entry) => reasons.set(entry.message, (reasons.get(entry.message) || 0) + 1));
      const why = [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([message, count]) => `${count}: ${message}`).join(' · ');
      setNotice(`${result?.approved.length || 0} lead(s) approved. ${result?.rejected.length || 0} rejected${why ? ` — ${why}` : ''}. No email was sent.`);
      setSelected(new Set()); await refresh(true);
    } catch { /* surfaced globally */ }
  };

  const loadWorkbookFile = async (file?: File) => {
    if (!file) return;
    try {
      await run('xlsx', async () => {
        if (!/\.xlsx$/i.test(file.name)) throw new Error('Choose an .xlsx workbook. Other file types are not accepted.');
        const maxBytes = data?.imports.maxFileBytes || 5 * 1024 * 1024;
        if (file.size > maxBytes) throw new Error(`Workbook is larger than the ${formatFileSize(maxBytes)} limit.`);
        const parsedSheets = await readWorkbook(await file.arrayBuffer());
        const sheets = parsedSheets.map((sheet) => ({
          name: String(sheet.sheet || 'Sheet'),
          rows: sheet.data.map((row) => row.map(workbookCellToText))
            .filter((row) => row.some((cell) => cell.trim() !== ''))
        })).filter((sheet) => sheet.rows.length > 0);
        if (!sheets.length) throw new Error('The workbook does not contain a non-empty worksheet.');
        setWorkbookUpload({ fileName: file.name, fileBytes: file.size, sheets });
        setWorkbookSheetName(sheets[0].name);
        setImportText('');
      });
    } catch { /* surfaced globally */ }
  };

  const submitImport = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const selectedSheet = workbookUpload?.sheets.find((sheet) => sheet.name === workbookSheetName);
      const result = await run('import', () => selectedSheet
        ? callServer<ImportResult>('uiImportWorkbook', {
            fileName: workbookUpload?.fileName,
            sheetName: selectedSheet.name,
            rows: selectedSheet.rows
          })
        : callServer<ImportResult>('uiImportLeads', importText));
      setNotice(`${result?.imported || 0} lead(s) imported as NEW; ${result?.withoutEmail || 0} need email research; ${result?.skipped.length || 0} skipped. Nothing was approved or emailed.`);
      setImportText(''); setWorkbookUpload(null); setWorkbookSheetName(''); setModal(null); await refresh(true);
    } catch { /* surfaced globally */ }
  };

  const openJob = (job: string) => { setPendingJob(job); setConfirmation(''); setModal('job'); };
  const sendTest = async () => {
    try {
      const result = await run('test', () => callServer<{ message: string }>('uiSendTest', drawerLead?.id || null));
      setNotice(result?.message || 'Test sent.');
    } catch { /* surfaced globally */ }
  };

  // Discover, research, approve and send, each stage through the route that
  // fits the server's time limit on its own, continuing while work remains.
  const runPipeline = async () => {
    try {
      const result = await run('pipeline', async () => {
        const parts: string[] = [];
        setProgress('Discovering brands…');
        try {
          const discovered = await callServer<JobSummary>('uiDiscoverBrands', []);
          parts.push(`discovered ${discovered?.added || 0}`);
        } catch (e) {
          parts.push(`discovery skipped — ${e instanceof Error ? e.message : String(e)}`);
        }
        const research = await researchAll();
        parts.push(`researched ${research.researched}, found ${research.found} address(es)`);

        let sent = 0, bursts = 0, last: JobSummary | undefined;
        do {
          setProgress(bursts ? `Sending… ${sent} sent so far` : 'Approving and sending…');
          last = await callServer<JobSummary>('uiRunPipeline');
          sent += last?.sent || 0;
          bursts += 1;
        } while (last?.stoppedForTime && (last?.remaining || 0) > 0 && bursts < MAX_BURSTS);
        return `${parts.join(', ')}. ${last?.message || ''}${bursts > 1 ? ` ${sent} sent over ${bursts} bursts.` : ''}`;
      });
      setNotice(result || 'Pipeline finished.');
      await refresh(true);
    } catch { /* surfaced globally */ }
  };

  const discoverBrands = async () => {
    try {
      const result = await run('discover', async () => {
        setProgress('Searching for brands…');
        const discovered = await callServer<JobSummary>('uiDiscoverBrands', []);
        // A company without an address is a row nobody can act on, so
        // research follows discovery in the same press.
        const research = discovered?.added ? await researchAll() : null;
        return `${discovered?.message || 'Discovery finished.'}${research ? ` Addresses found for ${research.found} of ${research.researched} researched${research.remaining ? ` (${research.remaining} still queued — press Research companies)` : ''}.` : ''}`;
      });
      setNotice(result);
      await refresh(true);
    } catch { /* surfaced globally */ }
  };

  const downloadReplies = async () => {
    try {
      await run('replies-export', async () => {
        const response = await fetch('/api/console/replies/export', { cache: 'no-store' });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error((payload as { error?: string } | null)?.error || `Export failed (${response.status}).`);
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `asaiverse-replies-${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      });
      setNotice('Replies workbook downloaded.');
    } catch { /* surfaced globally */ }
  };

  const verifyRouting = async () => {
    try {
      const result = await run('routing', () => callServer<{ message: string }>('uiVerifyRouting'));
      setNotice(result?.message || 'Routing verified.');
      await refresh(true);
    } catch { /* surfaced globally */ }
  };

  const runEnrichment = async () => {
    try {
      const result = await run('enrich', researchAll);
      setNotice(result.summary);
      await refresh(true);
    } catch { /* surfaced globally */ }
  };

  const executeJob = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const result = await run('job', async () => {
        // One typed confirmation covers the whole queue: a send burst that
        // stops for the server's time limit is continued here until the
        // queue, the per-run cap or the daily cap ends it.
        const total = { processed: 0, sent: 0, skipped: 0, errors: 0 };
        let bursts = 0, last: JobSummary | undefined;
        do {
          if (bursts) setProgress(`Sending… ${total.sent} sent so far, ${last?.remaining || 0} waiting`);
          last = await callServer<JobSummary>('uiRunJob', pendingJob, confirmation);
          total.processed += last?.processed || 0;
          total.sent += last?.sent || 0;
          total.skipped += last?.skipped || 0;
          total.errors += last?.errors || 0;
          bursts += 1;
        } while (last?.stoppedForTime && (last?.remaining || 0) > 0 && bursts < MAX_BURSTS);
        return { last, total, bursts };
      });
      // The server's message carries the reason — a daily cap already reached,
      // no eligible rows, a refused address — and a bare count without it
      // reads as the job silently doing nothing.
      const { last, total, bursts } = result;
      setNotice(`${last?.job || pendingJob}: ${last?.mode}. Processed ${total.processed}; live sent ${total.sent}; skipped ${total.skipped}; errors ${total.errors}${bursts > 1 ? ` over ${bursts} bursts` : ''}.${last?.message ? ` ${last.message}` : ''}`);
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

  const isLocal = !!data && !data.safety.sendsEnabled;
  const mode = data?.safety.mode || 'UNKNOWN';
  const configurationBlocked = !!data?.safety.configurationErrors.length;
  const mailBlocked = data ? data.safety.ownsMailbox === false : false;
  const jobsBlocked = mailBlocked || !!busy || !!data?.safety.systemDisabled || (mode !== 'DRY_RUN' && configurationBlocked);
  const selectedWorkbookSheet = workbookUpload?.sheets.find((sheet) => sheet.name === workbookSheetName) || null;
  const workbookTooLarge = !!selectedWorkbookSheet && selectedWorkbookSheet.rows.length > (data?.imports.maxRows || 500) + 1;
  const modeLabel = data?.safety.systemDisabled ? 'SYSTEM DISABLED' : configurationBlocked && mode === 'LIVE' ? 'LIVE — CONFIGURATION BLOCKED' : mode === 'DRY_RUN' ? 'DRY RUN — DELIVERY LOCKED' : mode === 'LIVE' ? 'LIVE — MANUAL SENDS ENABLED' : mode === 'MANAGE_ONLY' ? 'MANAGE ONLY — DELIVERY LOCKED' : mode;
  const jobPhrase = mode === 'LIVE' ? (pendingJob === 'INITIALS' ? 'SEND APPROVED' : pendingJob === 'FOLLOW_UPS' ? 'SEND FOLLOW UPS' : 'CHECK REPLIES') : mode === 'TEST' ? 'SEND TEST' : '';

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">A</div><div><strong>ASAIVERSE</strong><span>OUTREACH OPS</span></div></div>
      <nav aria-label="Primary"><a className="active" href="#overview"><Icon name="activity"/>Overview</a><a href="#leads"><Icon name="users"/>Lead control</a><a href="#replies"><Icon name="mail"/>Replies</a><a href="#activity"><Icon name="activity"/>Activity log</a></nav>
      <div className="sidebar-foot"><span className="eyebrow">Signed in</span><strong>{data?.ownerEmail || '—'}</strong><a href={data?.spreadsheetUrl} target="_blank" rel="noreferrer">Open source Sheet <Icon name="external" size={14}/></a></div>
    </aside>

    <main>
      <header className="topbar"><div><span className="eyebrow">PRIVATE OPERATOR CONSOLE</span><h1>Brand outreach control room</h1><p>{data?.event.name} · {data?.event.date} · {data?.event.location}</p></div><button className="icon-button" onClick={() => refresh()} disabled={!!busy} aria-label="Refresh dashboard"><Icon name="refresh"/></button></header>

      {isLocal && <div className="local-banner"><Icon name="alert"/><span>Editing, approving and importing write straight to your Sheet. Sending still runs in the Apps Script deployment — no email can leave from here.</span></div>}
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
          <div className="panel-head"><div><span className="eyebrow">APPROVAL QUEUE</span><h2>Lead control</h2></div><div className="head-actions"><button className="secondary" onClick={() => setModal('import')}><Icon name="upload"/>Drop XLSX</button><button className="danger-button" disabled={!selected.size || !!busy} onClick={deleteSelected}><Icon name="close"/>Delete {selected.size || ''}</button><button className="primary" disabled={!selected.size || !!busy} onClick={approveSelected}><Icon name="check"/>Approve {selected.size || ''}</button></div></div>
          <div className="filters"><label className="search"><Icon name="search"/><input aria-label="Search leads" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search company, email, category…"/></label><select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="ALL">All statuses</option>{data?.statuses.map((status) => <option key={status}>{status}</option>)}</select><span>{leads.length} shown</span></div>
          <div className="table-wrap"><table><thead><tr><th className="check-cell"><input aria-label="Select all visible" type="checkbox" checked={!!leads.length && leads.every((l) => selected.has(l.id))} onChange={(e) => { const next = new Set(selected); leads.forEach((l) => e.target.checked ? next.add(l.id) : next.delete(l.id)); setSelected(next); }}/></th><th>Company</th><th>Contact</th><th>Category</th><th>Status</th><th>Last activity</th><th aria-label="Actions"/></tr></thead><tbody>
            {leads.map((lead) => <tr key={lead.id} className={selected.has(lead.id) ? 'selected-row' : ''}><td className="check-cell"><input aria-label={`Select ${lead.company || lead.email}`} type="checkbox" checked={selected.has(lead.id)} onChange={(e) => { const next = new Set(selected); e.target.checked ? next.add(lead.id) : next.delete(lead.id); setSelected(next); }}/></td><td><button className="company-link" onClick={() => setDrawerLead(lead)}>{lead.company || <em>Company needed</em>}</button><small>{lead.email}</small></td><td>{lead.contactName || 'Team'}</td><td>{lead.category || 'Uncategorised'}</td><td><span className={`status ${statusTone(lead.status)}`}>{lead.status.replaceAll('_',' ')}</span>{lead.dueAction && <small className="due">{lead.dueAction.replaceAll('_',' ')} due</small>}</td><td>{formatDate(lead.updatedAt || lead.initialSentAt)}</td><td className="row-actions"><button title="Preview email" onClick={() => openPreview(lead)}><Icon name="mail"/></button><button title="Edit lead" onClick={() => setDrawerLead(lead)}><Icon name="edit"/></button></td></tr>)}
            {!leads.length && <tr><td colSpan={7} className="empty">No leads match this view.</td></tr>}
          </tbody></table></div>
          {data?.truncated && <p className="footnote">Showing the first {data.leads.length} records. Use the source Sheet for the complete list.</p>}
        </div>

        <aside className="panel run-panel"><span className="eyebrow">MANUAL OPERATIONS</span><h2>Run jobs</h2><p>{mailBlocked ? `Mail runs from ${data?.safety.mailboxOwner || 'the campaign mailbox'}. You can manage leads here; sending and reply checks belong to that account.` : 'Every job re-checks the Sheet, exact status gates, opt-outs, duplicate evidence and configured limits.'}</p><button className="pipeline-button" disabled={jobsBlocked || !data?.safety.sendsEnabled} onClick={runPipeline}><Icon name="activity"/><span><strong>Run full pipeline</strong><small>Research, approve, send in one pass</small></span></button><button disabled={!!busy || mailBlocked} onClick={verifyRouting}><Icon name="refresh"/><span><strong>Verify reply routing</strong><small>Loopback to your reply-to address · ~1 min</small></span></button><button disabled={!!busy || !data?.safety.sendsEnabled} onClick={sendTest}><Icon name="shield"/><span><strong>Send test to myself</strong><small>Redirected · no lead contacted</small></span></button><button disabled={!!busy} onClick={discoverBrands}><Icon name="users"/><span><strong>Discover brands</strong><small>Google search by category · India · adds NEW rows</small></span></button><button disabled={!!busy} onClick={runEnrichment}><Icon name="search"/><span><strong>Research companies</strong><small>Find published contacts · stays NEW</small></span></button><button disabled={jobsBlocked} onClick={() => openJob('INITIALS')}><Icon name="send"/><span><strong>{mode === 'DRY_RUN' ? 'Check approved leads' : 'Send approved leads'}</strong><small>Initial outreach queue</small></span></button><button disabled={jobsBlocked} onClick={() => openJob('FOLLOW_UPS')}><Icon name="refresh"/><span><strong>{mode === 'DRY_RUN' ? 'Check follow-ups' : 'Process follow-ups'}</strong><small>Day 4 and Day 9 only</small></span></button><button disabled={jobsBlocked} onClick={() => openJob('REPLIES')}><Icon name="mail"/><span><strong>{mode === 'DRY_RUN' ? 'Plan reply checks' : 'Check replies'}</strong><small>No self-message classification</small></span></button><div className="run-foot"><span>From</span><strong>{data?.sender.from}</strong><span>Always CC</span><strong>{data?.sender.cc.join(', ')}</strong></div></aside>
      </section>

      <section id="replies" className="panel replies-panel">
        <div className="panel-head">
          <div><span className="eyebrow">WHO ANSWERED</span><h2>Replies</h2></div>
          <div className="head-actions">
            <a className="secondary link-button" href={data?.spreadsheetUrl || '#'} target="_blank" rel="noreferrer"><Icon name="external" size={15}/>Open in Sheets</a>
            <button className="primary" disabled={!!busy || !data?.replies?.items.length} onClick={downloadReplies}><Icon name="upload"/>Download .xlsx</button>
          </div>
        </div>
        <div className="reply-list">
          {data?.replies?.items.map((item, i) => <article key={`${item.repliedAt}-${i}`}>
            <div className="reply-head">
              <strong>{item.company || item.from || 'Unknown company'}</strong>
              <span className={`status ${replyTone(item.type)}`}>{item.type || 'Reply'}</span>
              <small>{formatDate(item.repliedAt)}</small>
            </div>
            {item.subject && <p className="reply-subject">{item.subject}</p>}
            <p className="reply-snippet">{item.snippet || 'No text captured — open the thread to read it.'}</p>
            <small className="reply-foot">{item.from}{item.thread && <> · <a href={item.thread} target="_blank" rel="noreferrer">Open thread</a></>}</small>
          </article>)}
          {!data?.replies?.items.length && <p className="empty">No replies recorded yet. Every answer a brand sends is written to the {data?.replies?.tab || 'Replies'} tab when you run a reply check.</p>}
        </div>
      </section>

      <section id="activity" className="panel activity-panel"><div className="panel-head"><div><span className="eyebrow">AUDIT TRAIL</span><h2>Recent activity</h2></div><span className="muted-text">Latest {data?.logs.length || 0} events</span></div><div className="activity-list">{data?.logs.map((item, i) => <article key={`${item.timestamp}-${i}`}><span className={`activity-dot ${statusTone(item.result)}`}/><div><strong>{item.action} · {item.result}</strong><p>{item.message}</p><small>{item.company || item.email || 'System'} · {formatDate(item.timestamp)}</small></div></article>)}{!data?.logs.length && <p className="empty">No log entries yet.</p>}</div></section>
      <footer>Sheet is the source of truth · Runtime AI: none · Generated {formatDate(data?.generatedAt || '')}</footer>
    </main>

    {preview && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Email preview"><div className="modal preview-modal"><div className="modal-head"><div><span className="eyebrow">NO MESSAGE SENT</span><h2>{preview.action.replaceAll('_',' ')} preview</h2></div><button onClick={() => setPreview(null)}><Icon name="close"/></button></div>{preview.warnings.length > 0 && <div className="preview-warning"><Icon name="alert"/><div>{preview.warnings.map((w) => <p key={w}>{w}</p>)}</div></div>}<dl><dt>To</dt><dd>{preview.to || '—'}</dd><dt>CC</dt><dd>{preview.cc.join(', ')}</dd><dt>Subject</dt><dd>{preview.subject}</dd></dl><pre>{preview.body}</pre><div className="modal-actions"><button className="secondary" onClick={() => setPreview(null)}>Close preview</button></div></div></div>}

    {modal === 'import' && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Import leads"><form className="modal import-modal" onSubmit={submitImport}><div className="modal-head"><div><span className="eyebrow">IMPORT AS NEW</span><h2>Drop your lead workbook</h2></div><button type="button" onClick={() => setModal(null)}><Icon name="close"/></button></div><p>Your <code>.xlsx</code> file is read inside this browser. Choose a worksheet, review the sample, then import. The original file is not saved to Drive.</p><label className={`drop-zone ${dragActive ? 'drag-active' : ''}`} onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }} onDragOver={(e) => e.preventDefault()} onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }} onDrop={(e) => { e.preventDefault(); setDragActive(false); loadWorkbookFile(e.dataTransfer.files?.[0]); }}><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => loadWorkbookFile(e.target.files?.[0])}/><Icon name="upload" size={24}/><strong>{workbookUpload ? 'Choose a different workbook' : 'Drop an XLSX file here'}</strong><span>or click to browse · up to {formatFileSize(data?.imports.maxFileBytes || 5 * 1024 * 1024)}</span></label>{workbookUpload && selectedWorkbookSheet && <div className="workbook-card"><div className="workbook-summary"><div><strong>{workbookUpload.fileName}</strong><span>{formatFileSize(workbookUpload.fileBytes)} · {workbookUpload.sheets.length} worksheet{workbookUpload.sheets.length === 1 ? '' : 's'}</span></div>{workbookUpload.sheets.length > 1 && <label>Worksheet<select value={workbookSheetName} onChange={(e) => setWorkbookSheetName(e.target.value)}>{workbookUpload.sheets.map((sheet) => <option key={sheet.name}>{sheet.name}</option>)}</select></label>}</div><div className={`workbook-count ${workbookTooLarge ? 'too-large' : ''}`}><strong>{Math.max(0, selectedWorkbookSheet.rows.length - 1)}</strong><span>estimated data rows</span></div><div className="workbook-preview"><table><tbody>{selectedWorkbookSheet.rows.slice(0,4).map((row, rowIndex) => <tr key={rowIndex}>{row.slice(0,6).map((cell, cellIndex) => <td key={cellIndex}>{cell || '—'}</td>)}</tr>)}</tbody></table></div>{workbookTooLarge && <p className="file-error">Choose a worksheet with no more than {data?.imports.maxRows || 500} data rows.</p>}</div>}<div className="import-divider"><span>or paste emails / CSV</span></div><textarea rows={5} value={importText} onChange={(e) => { setImportText(e.target.value); if (e.target.value) { setWorkbookUpload(null); setWorkbookSheetName(''); } }} placeholder={'brand@example.com\n\n— or —\n\nCompany,Email,Category\nAcme,brand@acme.com,Gaming Peripherals'}/><div className="info-line"><Icon name="shield"/><span>Every row is created as <strong>NEW</strong>. Missing-email companies stay research-only, duplicates are skipped, and importing never approves or sends mail.</span></div><div className="modal-actions"><button type="button" className="secondary" onClick={() => setModal(null)}>Cancel</button><button type="submit" className="primary" disabled={(!selectedWorkbookSheet && !importText.trim()) || workbookTooLarge || busy === 'import'}>Import as NEW</button></div></form></div>}

    {modal === 'job' && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Run outreach job"><form className="modal compact" onSubmit={executeJob}><div className="modal-head"><div><span className="eyebrow">{mode}</span><h2>Run {pendingJob.toLowerCase().replace('_',' ')} job?</h2></div><button type="button" onClick={() => setModal(null)}><Icon name="close"/></button></div><p>{mode === 'DRY_RUN' ? 'This will validate and log eligible candidates. Gmail will not be read, no draft will be created, and no message will be sent.' : 'This job can access Gmail. Only rows that pass every server-side gate are eligible.'}</p>{jobPhrase && <label className="confirm-label">Type <strong>{jobPhrase}</strong> to continue<input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="off"/></label>}<div className="modal-actions"><button type="button" className="secondary" onClick={() => setModal(null)}>Cancel</button><button type="submit" className="primary" disabled={!!jobPhrase && confirmation.trim().toUpperCase() !== jobPhrase}>Run job</button></div></form></div>}

    {modal === 'disable' && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Emergency disable"><div className="modal compact"><div className="modal-head"><div><span className="eyebrow danger-text">SAFETY CONTROL</span><h2>Disable all outreach now?</h2></div><button onClick={() => setModal(null)}><Icon name="close"/></button></div><p>This enables the shared runtime kill switch, revokes the authorized trigger generation and removes outreach triggers owned by this Google account. It does not delete leads or logs.</p><div className="modal-actions"><button className="secondary" onClick={() => setModal(null)}>Cancel</button><button className="danger-button" onClick={emergencyDisable}>Enable kill switch</button></div></div></div>}

    {drawerLead && <LeadDrawer lead={drawerLead} statuses={data?.statuses || []} categories={data?.categories || []} onClose={() => setDrawerLead(null)} onSave={saveLead}/>} 
    {busy && <div className="busy-pill"><div className="loader small"/>{progress || (busy === 'preview' ? 'Generating preview…' : 'Working safely…')}</div>}
  </div>;
}

function LeadDrawer({ lead, statuses, categories, onClose, onSave }: { lead: Lead; statuses: string[]; categories: string[]; onClose: () => void; onSave: (lead: Lead) => void }) {
  const [draft, setDraft] = useState({ ...lead });
  const set = <K extends keyof Lead>(key: K, value: Lead[K]) => setDraft((current) => ({ ...current, [key]: value }));
  return <div className="drawer-backdrop" role="dialog" aria-modal="true" aria-label="Edit lead"><form className="drawer" onSubmit={(e) => { e.preventDefault(); onSave(draft); }}><div className="modal-head"><div><span className="eyebrow">LEAD #{lead.rowNumber}</span><h2>{lead.company || lead.email}</h2></div><button type="button" onClick={onClose}><Icon name="close"/></button></div><div className="form-grid"><label>Company<input value={draft.company} onChange={(e) => set('company',e.target.value)} placeholder="Required before approval"/></label><label>Contact name<input value={draft.contactName} onChange={(e) => set('contactName',e.target.value)}/></label><label className="wide">Email<input type="email" value={draft.email} onChange={(e) => set('email',e.target.value)}/></label><label>Category<select value={draft.category} onChange={(e) => set('category',e.target.value)}><option value="">Select category</option>{categories.map((c) => <option key={c}>{c}</option>)}</select></label><label>Status<select value={draft.status} onChange={(e) => set('status',e.target.value)}>{statuses.map((s) => <option key={s}>{s}</option>)}</select></label><label className="wide">Website<input value={draft.website} onChange={(e) => set('website',e.target.value)} placeholder="https://…"/></label><label className="wide">Personalization<textarea rows={4} value={draft.personalization} onChange={(e) => set('personalization',e.target.value)} placeholder="Included in the initial email"/></label><label className="wide">Internal notes<textarea rows={4} value={draft.notes} onChange={(e) => set('notes',e.target.value)} placeholder="Never inserted into emails"/></label><label className="checkbox-label"><input type="checkbox" checked={draft.optOut} onChange={(e) => set('optOut',e.target.checked)}/><span><strong>Opt out</strong><small>Immediately sets DO NOT CONTACT</small></span></label></div>{lead.lastError && <div className="preview-warning"><Icon name="alert"/><p>{lead.lastError}</p></div>}<div className="evidence"><span>Initial sent <strong>{formatDate(lead.initialSentAt)}</strong></span><span>Follow-up 1 <strong>{formatDate(lead.followUp1SentAt)}</strong></span><span>Follow-up 2 <strong>{formatDate(lead.followUp2SentAt)}</strong></span></div><div className="modal-actions sticky"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button type="submit" className="primary">Save lead</button></div></form></div>;
}

export default App;

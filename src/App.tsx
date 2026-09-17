import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { BarChart3, BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, CloudUpload, Download, FileText, Home, LogOut, Moon, Plus, RotateCcw, Settings as SettingsIcon, Sparkles, Trash2, TriangleAlert, Upload, X } from 'lucide-react';
import { Cell, ResponsiveContainer, BarChart, Bar, XAxis, Tooltip } from 'recharts';
import { ThinkingOrb } from 'thinking-orbs';
import { auth, firebaseConfigured, logout, signIn, type AuthUser } from './firebase';
import { cancelPendingPush, pushToCloud, syncOnLogin, type SyncStatus } from './sync';
import { clearUser, id, importAttendanceData, importTimetableData, put, remove, restore, userData } from './db';
import { dateISO, overall, subjectStats } from './math';
import { extractAttendance, extractTimetable } from './gemini';
import { analyse, annotate, buildWrites, summarise, validISO, willImport } from './attendance-import';
import { makeBackup, parseBackup } from './backup';
import type { Attendance, AttendanceStatus, BackupPayload, DetectedEntry, DetectedStatus, ReviewRow, Settings, Subject, SubjectGroup, TimetableEntry } from './types';
import { DAYS } from './types';

type Page='home'|'attendance'|'calendar'|'timetable'|'statistics'|'settings';
const colors=['#6d5dfc','#20c997','#ff8d5c','#e95d9a','#3989ff','#e0a526'];
const todayDay=()=>DAYS[(new Date().getDay()+6)%7];
const initialSubject=(uid:string, target:number):Subject=>({id:id(),uid,name:'',code:'',teacher:'',room:'',color:colors[0],target,createdAt:new Date().toISOString()});
// Open / close motion from transitions.dev (06-modal): scale up on the open clock, dip back on
// the faster close clock. The close is delayed by --modal-close-dur so the exit actually plays.
const MODAL_CLOSE_MS=150;
function Modal({children,onClose}:{children:React.ReactNode,onClose:()=>void}) {
  const [open,setOpen]=useState(false),[closing,setClosing]=useState(false);
  useEffect(()=>{const r=requestAnimationFrame(()=>setOpen(true));return()=>cancelAnimationFrame(r)},[]);
  const close=()=>{setOpen(false);setClosing(true);window.setTimeout(onClose,MODAL_CLOSE_MS)};
  return <div className={`scrim t-scrim${open?' is-open':''}`} role="dialog" aria-modal="true"><div className={`modal t-modal${open?' is-open':closing?' is-closing':''}`}><button className="icon close" onClick={close}><X/></button>{children}</div></div>
}
function App() {
 const [user,setUser]=useState<AuthUser|null>(null),[loading,setLoading]=useState(true),[page,setPage]=useState<Page>('home');
 const [subjects,setSubjects]=useState<Subject[]>([]),[records,setRecords]=useState<Attendance[]>([]),[table,setTable]=useState<TimetableEntry[]>([]),[settings,setSettings]=useState<Settings|null>(null);
 const [modal,setModal]=useState<'subject'|'entry'|'import'|'attendance-import'|'backup'|'restore'|'clear'|null>(null),[editSubject,setEditSubject]=useState<Subject|null>(null),[editEntry,setEditEntry]=useState<TimetableEntry|null>(null),[toast,setToast]=useState('');
 const [syncStatus,setSyncStatus]=useState<SyncStatus>('idle'),[restoring,setRestoring]=useState(false);
 const uid=user?.uid ?? '';
 // The toast stays mounted so it can animate out (transitions.dev 22-toast); the ref holds the
 // last message so the box is not empty while it leaves.
 const shownToast=useRef('');
 if(toast)shownToast.current=toast;
 const flash=(m:string)=>{setToast(m);window.setTimeout(()=>setToast(''),3500)};
 useEffect(()=>{ if(!auth){setLoading(false);return} let run=0; return onAuthStateChanged(auth,async u=>{
   // StrictMode mounts, unmounts and remounts in development, so two auth callbacks can be in
   // flight at once. Only the newest one is allowed to write state; an older one finishing late
   // used to overwrite fresh data with the snapshot it read before the cloud pull landed.
   const mine=++run;
   setUser(u);setLoading(false);
   if(!u){setSyncStatus('idle');setRestoring(false);return}
   const show=async()=>{const d=await userData(u.uid);if(run!==mine)return;setSubjects(d.subjects);setRecords(d.attendance);setTable(d.timetable);setSettings(d.settings)};
   await put('users',{uid:u.uid,email:u.email??'',name:u.displayName??'',photoURL:u.photoURL??'',updatedAt:new Date().toISOString()});
   await show();
   // Reconcile against the cloud. On a device that has no local copy yet this is the only source
   // of the user's data, so the UI says it is restoring rather than showing the empty state.
   if(run===mine)setRestoring(true);
   await syncOnLogin(u.uid,setSyncStatus);
   // Always re-read, whatever syncOnLogin reports. It writes to IndexedDB before it can fail, so
   // keying the re-read off a success flag left the pulled data on disk but not on screen until
   // the user refreshed the page by hand.
   await show();
   if(run===mine)setRestoring(false);
 })},[]);
 // `system` was written straight to data-theme, where it matched no CSS rule — so the default
 // setting never went dark whatever the OS said. Resolve it here instead, and follow the OS live.
 // The dark/light class is what keeps <ThinkingOrb theme="auto"> in step: it reads a dark or light
 // class off an ancestor, and `amoled` is not a name it knows.
 useEffect(()=>{
   const choice=settings?.theme??'system';
   const mq=window.matchMedia('(prefers-color-scheme: dark)');
   const apply=()=>{
     const resolved=choice==='system'?(mq.matches?'dark':'light'):choice;
     const root=document.documentElement,dark=resolved!=='light';
     root.dataset.theme=resolved;
     root.classList.toggle('dark',dark);
     root.classList.toggle('light',!dark);
     document.querySelector('meta[name="theme-color"]')?.setAttribute('content',resolved==='amoled'?'#000000':dark?'#171720':'#f6f6fb');
   };
   apply();
   mq.addEventListener('change',apply);
   return ()=>mq.removeEventListener('change',apply);
 },[settings?.theme]);
 const reload=async(push=true)=>{if(!uid)return;const d=await userData(uid);setSubjects(d.subjects);setRecords(d.attendance);setTable(d.timetable);setSettings(d.settings);if(push)pushToCloud(uid,setSyncStatus)};
 const saveSubject=async(s:Subject)=>{await put('subjects',s);await reload();setModal(null);flash('Subject saved')};
 const deleteSubject=async(s:Subject, history:boolean)=>{if(!confirm(`Delete ${s.name}?`))return;await remove('subjects',s.id);if(history)await Promise.all(records.filter(r=>r.subjectId===s.id).map(r=>remove('attendance',r.id)));await reload();flash(history?'Subject and history deleted':'Subject deleted; attendance history preserved')};
 const mark=async(subjectId:string,status:AttendanceStatus,date=dateISO(),sessionId='manual')=>{const old=records.find(r=>r.subjectId===subjectId&&r.date===date&&r.sessionId===sessionId);const item:Attendance={id:old?.id??id(),uid,subjectId,date,sessionId,status,updatedAt:new Date().toISOString()};await put('attendance',item);await reload();flash(status==='unmarked'?'Attendance cleared':`Marked ${status}. Undo?`)};
 const saveEntry=async(e:TimetableEntry)=>{await put('timetable',e);await reload();setModal(null);flash('Timetable saved')};
 const stats=useMemo(()=>overall(subjects,records),[subjects,records]);
 const navigate=(p:Page)=>setPage(p);
 if(loading)return <div className="center"><ThinkingOrb state="breathing" size={64} aria-label="Loading"/>Loading your attendance…</div>;
 if(!user)return <Login />;
 // First sign-in on a device: there is nothing local yet, so wait for the cloud pull instead of
 // flashing “Start with your subjects” at someone who already has a term of data.
 if(restoring&&!subjects.length&&!records.length)return <div className="center"><ThinkingOrb state="connecting" size={64} aria-label="Restoring"/>Restoring your attendance…</div>;
 const nav=[['home',Home,'Home'],['attendance',Check,'Attendance'],['calendar',CalendarDays,'Calendar'],['timetable',Clock3,'Timetable'],['statistics',BarChart3,'Statistics'],['settings',SettingsIcon,'Settings']] as const;
 return <div className="app"><aside><Brand/><nav>{nav.map(([p,I,l])=><button key={p} className={page===p?'active':''} onClick={()=>navigate(p)}><I/><span>{l}</span></button>)}</nav><Profile user={user}/></aside><main><header><div><p className="eyebrow">{new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})}</p><h1>{page==='home'?'Good to see you':page[0].toUpperCase()+page.slice(1)}</h1></div><div className="header-actions"><SyncBadge status={syncStatus}/><button className="avatar" onClick={()=>navigate('settings')}><img src={user.photoURL??''} alt="Profile"/></button></div></header>
 {page==='home'&&<Dashboard subjects={subjects} records={records} table={table} stats={stats} onMark={mark} onAdd={()=>{setEditSubject(initialSubject(uid,settings?.defaultTarget??75));setModal('subject')}} onEdit={s=>{setEditSubject(s);setModal('subject')}} onNav={navigate}/>} 
 {page==='attendance'&&<AttendancePage subjects={subjects} records={records} onMark={mark} onImport={()=>setModal('attendance-import')}/>} {page==='calendar'&&<CalendarPage subjects={subjects} records={records} onMark={mark}/>} {page==='timetable'&&<TimetablePage subjects={subjects} table={table} onAdd={()=>{setEditEntry(blankEntry(uid));setModal('entry')}} onEdit={e=>{setEditEntry(e);setModal('entry')}} onDelete={async e=>{if(confirm('Delete this class?')){await remove('timetable',e.id);await reload()}}} onImport={()=>setModal('import')}/>} {page==='statistics'&&<Statistics subjects={subjects} records={records} stats={stats}/>} {page==='settings'&&<SettingsPage user={user} settings={settings!} subjects={subjects} records={records} table={table} syncStatus={syncStatus} onSettings={async s=>{await put('settings',s);setSettings(s);pushToCloud(uid,setSyncStatus)}} onBackup={()=>setModal('backup')} onRestore={()=>setModal('restore')} onImportAttendance={()=>setModal('attendance-import')} onClear={()=>setModal('clear')} onLogout={async()=>{cancelPendingPush(uid);await logout();setSubjects([]);setRecords([]);setTable([]);setSettings(null);setSyncStatus('idle')}}/>}
 </main><nav className="bottom">{nav.slice(0,5).map(([p,I,l])=><button key={p} className={page===p?'active':''} onClick={()=>navigate(p)}><I/><span>{l}</span></button>)}</nav><div className={`toast t-toast${toast?' is-open':''}`} role="status" aria-live="polite">{shownToast.current}</div>
 {modal==='subject'&&editSubject&&<SubjectForm subject={editSubject} onSave={saveSubject} onDelete={editSubject.name?deleteSubject:undefined} onClose={()=>setModal(null)}/>} {modal==='entry'&&editEntry&&<EntryForm entry={editEntry} subjects={subjects} onSave={saveEntry} onClose={()=>setModal(null)}/>} {modal==='import'&&<ImportModal uid={uid} subjects={subjects} table={table} defaultTarget={settings?.defaultTarget??75} onSaved={async()=>{await reload();setModal(null);flash('Timetable imported')}} onClose={()=>setModal(null)}/>} {modal==='attendance-import'&&<AttendanceImportModal uid={uid} subjects={subjects} records={records} defaultTarget={settings?.defaultTarget??75} onDone={async(n:number)=>{await reload();setModal(null);flash(`${n} attendance records imported`)}} onClose={()=>setModal(null)}/>} {modal==='backup'&&<BackupModal data={{version:1,createdAt:new Date().toISOString(),account:{email:user.email??'',uid},subjects,attendance:records,timetable:table,settings:settings!}} onClose={()=>setModal(null)}/>} {modal==='restore'&&<RestoreModal uid={uid} onDone={async()=>{await reload();setModal(null);flash('Backup restored')}} onClose={()=>setModal(null)}/>} {modal==='clear'&&<Modal onClose={()=>setModal(null)}><h2>Clear local data?</h2><p>This removes attendance, subjects and timetable for this account from this device only. Download a backup first. Your Firestore backup is left untouched, so signing out and back in — or opening the app on another device — restores it.</p><button className="danger full" onClick={async()=>{await clearUser(uid);await reload(false);setModal(null);flash('Local data cleared')}}>Clear all data</button></Modal>}
 </div>
}
function Brand(){return <div className="brand"><span>✓</span><b>Self Attendance</b></div>}
function SyncBadge({status}:{status:SyncStatus}){if(status==='idle')return null;const label={syncing:'Syncing…',synced:'Synced',offline:'Offline — will sync later',error:'Sync paused — retrying'}[status];return <span className={`sync-badge ${status}`}>{status==='syncing'?<ThinkingOrb state="connecting" size={20} aria-label="Syncing"/>:<i className="dot"/>}{label}</span>}
// Seven weeks of a term, read as six weekday rows — one square per scheduled class. Fixed rather
// than random so the screen animates identically on every load, and chosen so the figures agree
// with each other: 31 present, 6 absent and 5 not held is exactly the 22-of-24 and 9-of-13 split
// shown in the two subject cards, and both cards' margins are what math.ts would work out.
const TERM=['pppppap','pppappp','pappppa','ppppap-','ppappp-','pp-p-p-'];
// Namespaced: bare .present/.absent already belong to the attendance mark buttons.
const TERM_CLASS:Record<string,string>={p:'mark-present',a:'mark-absent','-':'mark-none'};
const HEADLINE='Know exactly how many classes you can miss.';
const REPO='https://github.com/Yugraj20/SelfAttendancee';
// The sign-in screen loads before lucide-react would be worth pulling in, so its few icons are
// inline. Everything shares one stroked 24px box.
function Stroke({children,width=2}:{children:React.ReactNode,width?:number}){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>}
function GoogleMark(){return <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/><path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"/><path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"/><path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"/></svg>}
function Login(){
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const surface=useRef<HTMLDivElement>(null);
  // Pointer position feeds the ambient spotlight through CSS custom properties, so the effect
  // costs one style write per move instead of a React render.
  const track=(e:React.PointerEvent<HTMLDivElement>)=>{const el=surface.current;if(!el||e.pointerType!=='mouse')return;const r=el.getBoundingClientRect();el.style.setProperty('--mx',`${((e.clientX-r.left)/r.width*100).toFixed(1)}%`);el.style.setProperty('--my',`${((e.clientY-r.top)/r.height*100).toFixed(1)}%`)};
  const go=async()=>{setBusy(true);setError('');try{await signIn()}catch(e){setError(e instanceof Error?e.message:'That sign-in did not go through. Check your connection and try again.')}finally{setBusy(false)}};
  return <div className="login" ref={surface} onPointerMove={track}>
    <div className="login-glow" aria-hidden="true"><i/><i/><i/></div>
    <div className="login-shell">
      <header className="login-head">
        <div className="login-brand">
          <span className="login-mark"><Stroke width={3.2}><path d="M20 6 9 17l-5-5"/></Stroke></span>
          <span><b>Self Attendance</b><small>Smart class and bunk engine</small></span>
        </div>
        <span className="login-live"><i/>Works offline</span>
      </header>
      <div className="login-grid">
        <section className="login-lead">
          <p className="login-tag">Built for the 75% rule</p>
          <h1>{HEADLINE.split(' ').map((w,i)=><span key={i} style={{'--i':i} as CSSProperties}>{w}</span>)}</h1>
          <p>One tap marks a class. Self Attendance works out the percentages and tells you how many lectures you can still skip before the shortage list does.</p>
        </section>

        <div className="login-side">
          <section className="login-panel">
            <small><Stroke><path d="M12 13v8"/><path d="m8 17 4-4 4 4"/><path d="M20 16.6A5 5 0 0 0 18 7h-1.3A8 8 0 1 0 4 15.2"/></Stroke>Backup and sync</small>
            <h2>Sign in to carry your semester across devices</h2>
            <p>Your attendance lives on this device, so the app is instant and works offline. Signing in keeps a private copy, so the same term shows up on your phone and your laptop.</p>
            {!firebaseConfigured&&<div className="login-msg setup">Firebase needs configuration. Copy <code>.env.example</code> to <code>.env.local</code> and add your web app values.</div>}
            {error&&<div className="login-msg">{error}</div>}
            <button className="google" onClick={go} disabled={busy} aria-busy={busy}>{busy?<ThinkingOrb state="working" size={20} theme="light" aria-label="Signing in"/>:<GoogleMark/>}{busy?'Signing in…':'Continue with Google'}</button>
            <div className="login-vault">
              <Stroke><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></Stroke>
              <div>
                <b>Google shares your name, email and photo</b>
                <p>Nothing else. Your subjects, timetable and attendance stay in a record only your account can open.</p>
              </div>
            </div>
          </section>
          <nav className="login-links">
            <a href={`${REPO}#cloud-sync-firestore`}><Stroke><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></Stroke>How sync works</a>
            <a href={REPO}><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48l-.01-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.36 1.09 2.94.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85l-.01 2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2"/></svg>Source on GitHub</a>
          </nav>
        </div>

        <div className="login-facts">
          <div><span><Stroke><path d="M14 4.1 12 6"/><path d="m5.1 8-2.9-.8"/><path d="m6 12-1.9 2"/><path d="M7.2 2.2 8 5.1"/><path d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z"/></Stroke></span>Mark a lecture present or absent in one tap</div>
          <div><span><Stroke><path d="M3 13h4l3 7 4-16 3 9h4"/></Stroke></span>Every percentage and margin updates as you mark</div>
          <div><span><Stroke><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="8" width="10" height="8" rx="1"/></Stroke></span>Bring your timetable in from a photo or PDF</div>
        </div>

        <section className="login-demo">
          <header>
            <div>
              <h2>Your term, one square per class</h2>
              <p>Seven weeks of a real 75% semester</p>
            </div>
            <span className="login-chip"><Stroke><circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/></Stroke>Target 75%</span>
          </header>
          <div className="login-body">
            <div className="term" role="img" aria-label="Seven weeks of attendance: 31 classes present, 6 absent, 5 not held">
              {TERM.flatMap((row,r)=>[<b key={`day-${r}`}>{DAYS[r].slice(0,3)}</b>,...[...row].map((ch,c)=><i key={`${r}-${c}`} className={TERM_CLASS[ch]} style={{'--i':r*7+c} as CSSProperties}/>)])}
            </div>
            <div className="login-figures">
              <div className="login-subjects">
                <article className="login-subject safe">
                  <header>
                    <div><h3>Operating Systems</h3><small>CS-302, 22 of 24 held</small></div>
                    <b>91.7%</b>
                  </header>
                  <div className="login-bar"><i style={{width:'91.7%'}}/><u/></div>
                  <p><Stroke><circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/></Stroke>Safe to miss 5 classes</p>
                  <small className="login-next">Next class Thursday, 10:00</small>
                </article>
                <article className="login-subject risk">
                  <header>
                    <div><h3>Theory of Computation</h3><small>CS-304, 9 of 13 held</small></div>
                    <b>69.2%</b>
                  </header>
                  <div className="login-bar"><i style={{width:'69.2%'}}/><u/></div>
                  <p><Stroke><path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></Stroke>Attend the next 3 to clear 75%</p>
                  <small className="login-next">Next class Friday, 14:00</small>
                </article>
              </div>
              <div className="term-tally">
                <div className="p"><b>31</b><span>present</span></div>
                <div className="a"><b>6</b><span>absent</span></div>
                <div className="n"><b>5</b><span>not held</span></div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
}
function Profile({user}:{user:AuthUser}){return <div className="profile"><img src={user.photoURL??''} alt=""/><div><b>{user.displayName}</b><small>{user.email}</small></div></div>}
function Dashboard({subjects,records,table,stats,onMark,onAdd,onEdit,onNav}:{subjects:Subject[];records:Attendance[];table:TimetableEntry[];stats:ReturnType<typeof overall>;onMark:(id:string,s:AttendanceStatus)=>void;onAdd:()=>void;onEdit:(s:Subject)=>void;onNav:(p:Page)=>void}) {
  const time=new Date().toTimeString().slice(0,5), today=table.filter(t=>t.day===todayDay()).sort((a,b)=>a.startTime.localeCompare(b.startTime));
  const currentClass=today.find(t=>t.startTime<=time&&t.endTime>time), next=today.find(t=>t.startTime>time);
  return <>
    <section className="grid summary"><article className="overall card"><div><p>Overall attendance</p><h2>{stats.pct.toFixed(0)}<small>%</small></h2><span>{stats.present} present · {stats.absent} absent</span></div><div className="ring" style={{'--p':`${stats.pct}%`} as CSSProperties}><b>{stats.total}</b><small>classes</small></div></article>
    <article className="card today"><p>Today’s rhythm</p>{!today.length?<><h3>Nothing scheduled</h3><span>Add your timetable to see class cues here.</span></>:currentClass?<><h3>Now · {currentClass.subject}</h3><span>{currentClass.startTime}–{currentClass.endTime} · {currentClass.room||'Room TBA'}</span>{next&&<div className="next">Next: {next.subject} at {next.startTime}</div>}</>:next?<><h3>College not started yet</h3><span>Next: {next.subject} at {next.startTime}</span></>:<><h3>College over</h3><span>Nice work — today’s classes are done.</span></>}</article>
    <article className="card action"><Sparkles/><h3>Quick start</h3><button onClick={onAdd}><Plus/> Add subject</button><button className="text" onClick={()=>onNav('timetable')}>Set up timetable →</button></article></section>
    <section className="section-title"><div><h2>Your subjects</h2><p>One tap is all it takes.</p></div><button className="primary" onClick={onAdd}><Plus/> Add subject</button></section>
    {!subjects.length?<Empty title="Start with your subjects" text="Add a subject or import your timetable, then your attendance will come to life." action="Add your first subject" onAction={onAdd}/>:<section className="subject-grid">{subjects.map(s=>{const x=subjectStats(s,records);return <article className="subject card" key={s.id} style={{'--accent':s.color} as CSSProperties}><div className="subject-top"><span className="subject-icon">{s.code.slice(0,2)||'•'}</span><button className="more" onClick={()=>onEdit(s)} aria-label={`Edit ${s.name}`}>•••</button></div><h3>{s.name}</h3><p>{s.code||'No code'} · {s.teacher||'Teacher not set'}</p><div className="percent"><b>{x.pct.toFixed(0)}%</b><span>{x.present} / {x.total} classes</span></div><div className="progress"><i style={{width:`${Math.min(x.pct,100)}%`}}/></div><small className={x.state}>{x.pct>=s.target?`Safe to miss ${x.bunk} classes`:`Attend next ${x.required} to reach ${s.target}%`}</small><div className="mark"><button aria-label="Mark absent" className="absent" onClick={()=>onMark(s.id,'absent')}>−</button><button aria-label="Mark present" className="present" onClick={()=>onMark(s.id,'present')}><Check/> Present</button></div></article>})}</section>}
  </>
}
function AttendancePage({subjects,records,onMark,fixedDate,onImport}:{subjects:Subject[];records:Attendance[];onMark:(id:string,s:AttendanceStatus)=>void;fixedDate?:string;onImport?:()=>void}) { const [chosen,setChosen]=useState(dateISO()); const day=fixedDate??chosen; return <>{onImport&&<div className="import-banner"><Sparkles/><div><b>Import attendance with AI</b><span>Upload a .txt export and review every record before it is saved.</span></div><button onClick={onImport}>Import</button></div>}<div className="toolbar"><label>Class date<input type="date" value={day} disabled={Boolean(fixedDate)} onChange={e=>setChosen(e.target.value)}/></label><span>{new Date(day+'T12:00').toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})}</span></div>{!subjects.length?<Empty title="No subjects yet" text="Add subjects from Home to start marking attendance."/>:<div className="attendance-list">{subjects.map(s=>{const record=records.find(r=>r.subjectId===s.id&&r.date===day&&r.sessionId==='manual');return <article className="card attendance-row" key={s.id}><span className="subject-icon" style={{background:s.color}}>{s.code.slice(0,2)}</span><div><h3>{s.name}</h3><small>{record?`Marked ${record.status}`:'Not marked'}</small></div><div className="three"><button className={record?.status==='present'?'picked present':''} onClick={()=>onMark(s.id,'present')}>Present</button><button className={record?.status==='absent'?'picked absent':''} onClick={()=>onMark(s.id,'absent')}>Absent</button><button className={record?.status==='unmarked'?'picked':''} onClick={()=>onMark(s.id,'unmarked')}>Clear</button></div></article>})}</div>}</> }
function CalendarPage({subjects,records,onMark}:{subjects:Subject[],records:Attendance[],onMark:(id:string,s:AttendanceStatus,date:string)=>void}){const [cursor,setCursor]=useState(()=>new Date()),[selected,setSelected]=useState(dateISO());const y=cursor.getFullYear(),m=cursor.getMonth(),first=new Date(y,m,1),count=new Date(y,m+1,0).getDate(),offset=(first.getDay()+6)%7;const dates=Array.from({length:offset+count},(_,i)=>i<offset?'':`${y}-${String(m+1).padStart(2,'0')}-${String(i-offset+1).padStart(2,'0')}`);const daily=records.filter(r=>r.date===selected&&r.status!=='unmarked');return <><div className="calendar-head"><button className="icon" onClick={()=>setCursor(new Date(y,m-1,1))}><ChevronLeft/></button><h2>{cursor.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</h2><button className="icon" onClick={()=>setCursor(new Date(y,m+1,1))}><ChevronRight/></button></div><div className="week">{['M','T','W','T','F','S','S'].map((x,i)=><b key={i}>{x}</b>)}{dates.map((d,i)=>d?<button key={d} onClick={()=>setSelected(d)} className={`date ${selected===d?'selected':''}`}><span>{i-offset+1}</span><i className={records.some(r=>r.date===d&&r.status==='absent')?'has-absent':records.some(r=>r.date===d&&r.status==='present')?'has-present':''}/></button>:<span key={i}/>)}</div><section className="section-title"><div><h2>{new Date(selected+'T12:00').toLocaleDateString(undefined,{month:'short',day:'numeric'})}</h2><p>{daily.filter(x=>x.status==='present').length} present · {daily.filter(x=>x.status==='absent').length} absent</p></div></section><AttendancePage subjects={subjects} records={records} fixedDate={selected} onMark={(sid,s)=>onMark(sid,s,selected)}/></>}
const blankEntry=(uid:string):TimetableEntry=>({id:id(),uid,day:'Monday',subjectId:'',subject:'',startTime:'09:00',endTime:'10:00',room:'',teacher:'',type:'Lecture',notes:'',order:0});
function TimetablePage({subjects,table,onAdd,onEdit,onDelete,onImport}:{subjects:Subject[],table:TimetableEntry[],onAdd:()=>void,onEdit:(e:TimetableEntry)=>void,onDelete:(e:TimetableEntry)=>void,onImport:()=>void}){const [day,setDay]=useState(todayDay());const entries=table.filter(t=>t.day===day).sort((a,b)=>a.startTime.localeCompare(b.startTime));return <><div className="toolbar"><div className="day-tabs">{DAYS.map(d=><button key={d} className={d===day?'active':''} onClick={()=>setDay(d)}>{d.slice(0,3)}</button>)}</div><button className="primary" onClick={onAdd}><Plus/> Add class</button></div><div className="import-banner"><Sparkles/><div><b>Import timetable with AI</b><span>Upload a PDF or image, then review every detected class.</span></div><button onClick={onImport}>Import</button></div>{!entries.length?<Empty title={`No classes on ${day}`} text="Build your weekly plan manually or import a timetable." action="Import timetable" onAction={onImport}/>:<div className="timeline">{entries.map(e=><article className="card entry" key={e.id}><time>{e.startTime}<small>{e.endTime}</small></time><div><h3>{e.subject}</h3><p>{e.type} · {e.room||'Room TBA'} {e.teacher&&`· ${e.teacher}`}</p><small>{e.notes}</small></div><button className="icon" onClick={()=>onEdit(e)}>•••</button><button className="icon danger-text" onClick={()=>onDelete(e)}><Trash2/></button></article>)}</div>}</>}
function Statistics({subjects,records,stats}:{subjects:Subject[],records:Attendance[],stats:ReturnType<typeof overall>}){const chart=subjects.map(s=>({name:s.code||s.name.slice(0,8),value:+subjectStats(s,records).pct.toFixed(0),fill:s.color}));const best=[...subjects].sort((a,b)=>subjectStats(b,records).pct-subjectStats(a,records).pct),lowest=best[best.length-1];return <><section className="stat-cards"><article className="card"><p>Classes attended</p><h2>{stats.present}</h2></article><article className="card"><p>Classes missed</p><h2>{stats.absent}</h2></article><article className="card"><p>Overall</p><h2>{stats.pct.toFixed(1)}%</h2></article></section><section className="chart card"><h2>Subject attendance</h2>{chart.length?<ResponsiveContainer width="100%" height={270}><BarChart data={chart}><XAxis dataKey="name"/><Tooltip/><Bar dataKey="value" radius={[8,8,0,0]}>{chart.map(x=><Cell key={x.name} fill={x.fill}/>)}</Bar></BarChart></ResponsiveContainer>:<p>Add attendance to unlock your statistics.</p>}</section><section className="grid two"><article className="card"><h3>Best subject</h3><b>{best[0]?.name||'—'}</b><p>{best[0]?subjectStats(best[0],records).pct.toFixed(0)+'%':'No data yet'}</p></article><article className="card"><h3>Needs attention</h3><b>{lowest?.name||'—'}</b><p>{lowest?subjectStats(lowest,records).pct.toFixed(0)+'%':'No data yet'}</p></article></section></>}
function SettingsPage({user,settings,subjects,records,table,syncStatus,onSettings,onBackup,onRestore,onImportAttendance,onClear,onLogout}:{user:AuthUser,settings:Settings,subjects:Subject[],records:Attendance[],table:TimetableEntry[],syncStatus:SyncStatus,onSettings:(s:Settings)=>void,onBackup:()=>void,onRestore:()=>void,onImportAttendance:()=>void,onClear:()=>void,onLogout:()=>void}){return <div className="settings"><section className="card account"><img src={user.photoURL??''} alt=""/><div><h2>{user.displayName}</h2><p>{user.email}</p><SyncBadge status={syncStatus}/></div><button onClick={onLogout}><LogOut/> Logout</button></section><section className="card"><h2>Attendance</h2><label>Default target percentage<input type="number" min="1" max="100" value={settings.defaultTarget} onChange={e=>onSettings({...settings,defaultTarget:Math.max(1,Math.min(100,+e.target.value))})}/></label><p className="muted">New subjects start with this target. Existing subjects keep their own target.</p></section><section className="card"><h2>Appearance</h2><div className="themes">{(['system','light','dark','amoled'] as const).map(t=><button key={t} className={settings.theme===t?'picked':''} onClick={()=>onSettings({...settings,theme:t})}>{t==='amoled'?<Moon/>:null}{t}</button>)}</div></section><section className="card"><h2>Your data</h2><p className="muted">Your attendance lives in IndexedDB on this device first, and is mirrored to a private Firestore record under your account so it follows you across devices. Only the file you pick for an AI import — a timetable, or a .txt attendance export — is sent to Gemini, and nothing is written until you confirm the review.</p><div className="data-actions"><button onClick={onBackup}><Download/> Backup data</button><button onClick={onRestore}><Upload/> Restore backup</button><button onClick={onImportAttendance}><Sparkles/> Import attendance</button><button className="danger-text" onClick={onClear}><Trash2/> Clear local data</button></div></section><section className="card about"><h2>Self Attendance <small>v1.0.0</small></h2><p>{subjects.length} subjects · {records.length} attendance records · {table.length} timetable sessions</p><p className="muted">Local-first by design: every screen reads and writes IndexedDB directly, so the app stays fast and fully usable offline. Sign in to additionally back up and sync that data to your own Firestore record.</p></section></div>}
function SubjectForm({subject,onSave,onDelete,onClose}:{subject:Subject,onSave:(s:Subject)=>void,onDelete?: (s:Subject,history:boolean)=>void,onClose:()=>void}){const [s,setS]=useState(subject);const valid=s.name.trim()&&s.target>0&&s.target<=100;return <Modal onClose={onClose}><h2>{subject.name?'Edit subject':'New subject'}</h2><form onSubmit={e=>{e.preventDefault();if(valid)onSave(s)}}><label>Subject name<input required value={s.name} onChange={e=>setS({...s,name:e.target.value})} placeholder="e.g. Data Structures"/></label><div className="form-grid"><label>Short code<input value={s.code} onChange={e=>setS({...s,code:e.target.value})} placeholder="CS201"/></label><label>Target %<input required type="number" min="1" max="100" value={s.target} onChange={e=>setS({...s,target:+e.target.value})}/></label></div><label>Teacher<input value={s.teacher} onChange={e=>setS({...s,teacher:e.target.value})}/></label><label>Room<input value={s.room} onChange={e=>setS({...s,room:e.target.value})}/></label><label>Color<input type="color" value={s.color} onChange={e=>setS({...s,color:e.target.value})}/></label><button className="primary full" disabled={!valid}>Save subject</button></form>{onDelete&&<div className="delete-subject"><button className="danger" onClick={()=>onDelete(s,false)}>Delete subject, keep history</button><button className="danger-text" onClick={()=>onDelete(s,true)}>Delete subject & history</button></div>}</Modal>}
function EntryForm({entry,subjects,onSave,onClose}:{entry:TimetableEntry,subjects:Subject[],onSave:(e:TimetableEntry)=>void,onClose:()=>void}){const [e,setE]=useState(entry);const choose=(v:string)=>{const s=subjects.find(x=>x.id===v);setE({...e,subjectId:v,subject:s?.name??e.subject,teacher:s?.teacher??e.teacher,room:s?.room??e.room})};return <Modal onClose={onClose}><h2>{entry.subject?'Edit class':'New class'}</h2><form onSubmit={x=>{x.preventDefault();if(e.subject.trim()&&e.startTime<e.endTime)onSave(e)}}><label>Day<select value={e.day} onChange={x=>setE({...e,day:x.target.value})}>{DAYS.map(d=><option key={d}>{d}</option>)}</select></label><label>Subject<select value={e.subjectId} onChange={x=>choose(x.target.value)}><option value="">Custom / type below</option>{subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Subject name<input required value={e.subject} onChange={x=>setE({...e,subject:x.target.value})}/></label><div className="form-grid"><label>Start<input required type="time" value={e.startTime} onChange={x=>setE({...e,startTime:x.target.value})}/></label><label>End<input required type="time" value={e.endTime} onChange={x=>setE({...e,endTime:x.target.value})}/></label></div><div className="form-grid"><label>Room<input value={e.room} onChange={x=>setE({...e,room:x.target.value})}/></label><label>Class type<select value={e.type} onChange={x=>setE({...e,type:x.target.value})}><option>Lecture</option><option>Lab</option><option>Tutorial</option><option>Seminar</option></select></label></div><label>Teacher<input value={e.teacher} onChange={x=>setE({...e,teacher:x.target.value})}/></label><label>Notes<input value={e.notes} onChange={x=>setE({...e,notes:x.target.value})}/></label><button className="primary full">Save class</button></form></Modal>}
function ImportModal({uid,subjects,table,defaultTarget,onSaved,onClose}:{uid:string,subjects:Subject[],table:TimetableEntry[],defaultTarget:number,onSaved:()=>void,onClose:()=>void}){const [file,setFile]=useState<File|null>(null),[items,setItems]=useState<DetectedEntry[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');const choose=async(f?:File)=>{if(!f)return;setFile(f);setBusy(true);setError('');try{setItems(await extractTimetable(f))}catch(e){setError(e instanceof Error?e.message:'Unable to import this timetable.')}finally{setBusy(false)}};const edit=(i:number,k:string,v:string)=>setItems(items.map((x,n)=>n===i?{...x,[k]:v}:x));const commit=async()=>{setError('');try{const norm=(v:string)=>v.trim().toLowerCase();const known=new Map<string,Subject>();subjects.forEach(s=>known.set(norm(s.name),s));const saves:Subject[]=[],entries:TimetableEntry[]=[],seen=new Set<string>(),existing=new Set(table.map(t=>`${t.subjectId}|${t.day}|${t.startTime}|${t.endTime}|${t.room}`));let created=0;for(const x of items){if(!x.day||!x.subject?.trim()||!x.startTime||!x.endTime||x.startTime>=x.endTime)continue;const day=DAYS.find(d=>d.toLowerCase()===x.day!.toLowerCase());if(!day)continue;const name=x.subject.trim(),room=x.room??'',teacher=x.teacher??'';let s=known.get(norm(name));if(!s){s={id:id(),uid,name,code:x.subjectCode?.trim()||'',teacher,room,target:defaultTarget,color:colors[(subjects.length+created)%colors.length],createdAt:new Date().toISOString()};known.set(norm(name),s);saves.push(s);created++}else{const upd={...s,code:s.code||x.subjectCode?.trim()||'',teacher:s.teacher||teacher,room:s.room||room};if(upd.code!==s.code||upd.teacher!==s.teacher||upd.room!==s.room){known.set(norm(name),upd);saves.push(upd)}}const key=`${s.id}|${day}|${x.startTime}|${x.endTime}|${room}`;if(existing.has(key)||seen.has(key))continue;seen.add(key);entries.push({...blankEntry(uid),id:id(),uid,day,subjectId:s.id,subject:name,startTime:x.startTime,endTime:x.endTime,room,teacher,type:x.type||'Lecture',notes:x.notes??'',order:0})}await importTimetableData(saves,entries);onSaved()}catch(e){setError(e instanceof Error?e.message:'Import failed. Please try again.')}};return <Modal onClose={onClose}><h2><Sparkles/> Import timetable with AI</h2><p className="muted">Only this selected timetable file is sent to Gemini. Review before anything is saved.</p><label className="drop"><CloudUpload/><b>{file?file.name:'Upload timetable'}</b><span>PDF, PNG, JPG, JPEG or WEBP · max 15 MB</span><input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={e=>choose(e.target.files?.[0])}/></label>{busy&&<div className="processing"><ThinkingOrb state="searching" size={20} aria-label="Working"/> Reading your timetable…</div>}{error&&<div className="error">{error}</div>}{items.length>0&&<><div className="success"><Check/> AI detected {items.length} timetable entries. Edit anything uncertain.</div><div className="review">{items.map((x,i)=><div key={i} className="review-row"><select value={x.day||'Monday'} onChange={e=>edit(i,'day',e.target.value)}>{DAYS.map(d=><option key={d}>{d}</option>)}</select><input value={x.subject||''} onChange={e=>edit(i,'subject',e.target.value)} placeholder="Subject"/><input type="time" value={x.startTime||''} onChange={e=>edit(i,'startTime',e.target.value)}/><input type="time" value={x.endTime||''} onChange={e=>edit(i,'endTime',e.target.value)}/><input value={x.room||''} onChange={e=>edit(i,'room',e.target.value)} placeholder="Room"/><button className="icon danger-text" onClick={()=>setItems(items.filter((_,n)=>n!==i))}><Trash2/></button></div>)}</div><button className="primary full" onClick={commit}>Import {items.length} timetable entries</button></>}</Modal>}
const MATCH_TEXT={name:'Matched by name',code:'Matched by code',abbreviation:'Matched as an abbreviation',partial:'Close match — please check',none:'No matching subject'} as const;
const ISSUE_TEXT:Record<ReviewRow['issue'],string>={'none':'','low-confidence':'Check this one','no-date':'Needs a date','bad-date':'Date unreadable','no-status':'Needs a status','no-subject':'No subject found','duplicate':'Already recorded','conflict':'Differs from your mark'};
const ROW_CAP=300;
function ImportStat({label,value,tone}:{label:string,value:number,tone?:string}){return <div className={`import-stat${tone?' '+tone:''}`}><b>{value}</b><span>{label}</span></div>}
function ImportRow({row,action,overwrite,onChange,onToggle}:{row:ReviewRow,action:SubjectGroup['action'],overwrite:boolean,onChange:(p:Partial<ReviewRow>)=>void,onToggle:()=>void}){
  const live=willImport(row,action,overwrite),note=ISSUE_TEXT[row.issue]||row.note;
  return <div className={`import-row${live?'':' off'}`}>
    <input type="checkbox" checked={row.include&&action!=='skip'} disabled={action==='skip'} onChange={onToggle} aria-label={`Include the record for ${row.date||'this class'}`}/>
    <input type="date" value={validISO(row.date)?row.date:''} onChange={e=>onChange({date:e.target.value})} aria-label="Class date"/>
    <select className={`status-${row.status}`} value={row.status} onChange={e=>onChange({status:e.target.value as DetectedStatus})} aria-label="Attendance status"><option value="present">Present</option><option value="absent">Absent</option><option value="unknown">Unknown</option></select>
    <div className="import-meta">{note&&<span className={`import-flag ${row.issue}`}>{note}{row.issue==='conflict'&&row.existingStatus?` (${row.existingStatus} here now)`:''}</span>}{row.source&&<small title={row.source}>{row.source}</small>}</div>
  </div>
}
function AttendanceImportModal({uid,subjects,records,defaultTarget,onDone,onClose}:{uid:string,subjects:Subject[],records:Attendance[],defaultTarget:number,onDone:(n:number)=>void,onClose:()=>void}){
  const [stage,setStage]=useState<'upload'|'analyzing'|'review'|'importing'|'done'>('upload');
  const [file,setFile]=useState<File|null>(null),[error,setError]=useState(''),[warnings,setWarnings]=useState<string[]>([]),[truncated,setTruncated]=useState(false);
  const [groups,setGroups]=useState<SubjectGroup[]>([]),[overwrite,setOverwrite]=useState(false),[showAll,setShowAll]=useState(false),[saved,setSaved]=useState({subjects:0,records:0,present:0,absent:0});
  const view=useMemo(()=>annotate(groups,records),[groups,records]);
  const sum=useMemo(()=>summarise(view,overwrite),[view,overwrite]);
  const read=async(f?:File)=>{
    if(!f)return; setFile(f); setError(''); setStage('analyzing');
    try{ const parsed=await extractAttendance(f); setWarnings(parsed.warnings); setTruncated(parsed.truncated); setGroups(analyse(parsed,subjects)); setShowAll(false); setStage('review') }
    catch(e){ setError(e instanceof Error?e.message:'We could not read that file. Please try again.'); setStage('upload') }
  };
  const setGroup=(key:string,patch:Partial<SubjectGroup>)=>setGroups(gs=>gs.map(g=>g.key===key?{...g,...patch}:g));
  const setRow=(gk:string,rk:string,patch:Partial<ReviewRow>)=>setGroups(gs=>gs.map(g=>g.key===gk?{...g,rows:g.rows.map(r=>r.key===rk?{...r,...patch}:r)}:g));
  const commit=async()=>{
    setError(''); setStage('importing');
    try{ const w=buildWrites(view,{uid,defaultTarget,colors,subjects,existing:records,overwrite}); await importAttendanceData(w.subjects,w.records); setSaved({subjects:w.subjects.length,records:w.records.length,present:sum.present,absent:sum.absent}); setStage('done') }
    catch{ setError('Saving failed, so nothing was imported. Your existing attendance is unchanged — try confirming again.'); setStage('review') }
  };
  let budget=showAll?Infinity:ROW_CAP;
  return <Modal onClose={onClose}>
    <h2><Sparkles/> Import attendance with AI</h2>
    <p className="muted">Gemini reads the .txt file you pick and works out its layout on its own. Nothing is saved until you confirm the review.</p>
    <ol className="import-steps">{(['Upload','Analysing','Review','Importing','Complete'] as const).map((s,i)=>{const at=['upload','analyzing','review','importing','done'].indexOf(stage);return <li key={s} className={i===at?'at':i<at?'past':''}>{s}</li>})}</ol>
    {stage==='upload'&&<>
      <label className="drop"><FileText/><b>{file?file.name:'Choose a .txt file'}</b><span>Plain text only · max 2 MB</span><input type="file" accept=".txt,text/plain" onChange={e=>read(e.target.files?.[0])}/></label>
      {error&&<div className="error"><TriangleAlert/> {error}</div>}
      {file&&error&&<button className="primary full" onClick={()=>read(file)}><RotateCcw/> Retry analysis</button>}
    </>}
    {stage==='analyzing'&&<div className="processing"><ThinkingOrb state="searching" size={20} aria-label="Working"/> Reading {file?.name} and matching it to your subjects…</div>}
    {stage==='importing'&&<div className="processing"><ThinkingOrb state="searching" size={20} aria-label="Working"/> Saving {sum.ready} records…</div>}
    {stage==='review'&&<>
      <div className="success"><Check/> Gemini found {sum.total} records across {sum.subjects} {sum.subjects===1?'subject':'subjects'}.</div>
      {error&&<div className="error"><TriangleAlert/> {error}</div>}
      {truncated&&<div className="notice">That file was long, so only the first part was analysed. Split it up if records are missing.</div>}
      {warnings.length>0&&<div className="notice"><b>Gemini could not interpret everything:</b><ul>{warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></div>}
      <div className="import-stats">
        <ImportStat label="Ready to import" value={sum.ready} tone="ready"/>
        <ImportStat label="Present" value={sum.present} tone="present"/>
        <ImportStat label="Absent" value={sum.absent} tone="absent"/>
        <ImportStat label="Needs review" value={sum.review} tone={sum.review?'warn':''}/>
        <ImportStat label="Already recorded" value={sum.duplicates}/>
        <ImportStat label="Clashes with your marks" value={sum.conflicts} tone={sum.conflicts?'warn':''}/>
      </div>
      <p className="muted import-note">{sum.matched} {sum.matched===1?'subject matches':'subjects match'} what you already have{sum.creating?`, ${sum.creating} will be created`:''}{sum.skipping?`, ${sum.skipping} skipped`:''}. {sum.dropped} {sum.dropped===1?'record':'records'} will not be imported.</p>
      {sum.conflicts>0&&<div className="import-conflicts">
        <b>{sum.conflicts} {sum.conflicts===1?'day already has':'days already have'} a different mark</b>
        <label className="choice"><input type="radio" checked={!overwrite} onChange={()=>setOverwrite(false)}/> Keep what I marked (skip those days)</label>
        <label className="choice"><input type="radio" checked={overwrite} onChange={()=>setOverwrite(true)}/> Replace them with the file</label>
      </div>}
      <div className="import-review">{view.map(g=>{
        const kept=g.rows.filter(r=>willImport(r,g.action,overwrite)).length,take=Math.max(0,budget);budget-=g.rows.length;
        return <section key={g.key} className="import-group">
          <header className="import-subject">
            <div><b>{g.label}</b><small className={g.matchKind==='none'?'unmatched':''}>{g.action==='skip'?'Skipped':g.action==='create'?'Will be created as a new subject':MATCH_TEXT[g.matchKind]}</small></div>
            <select value={g.action==='link'?`link:${g.matchId}`:g.action} onChange={e=>{const v=e.target.value;setGroup(g.key,v.startsWith('link:')?{action:'link',matchId:v.slice(5)}:{action:v as SubjectGroup['action'],matchId:''})}} aria-label={`What to do with ${g.label}`}>
              {subjects.map(s=><option key={s.id} value={`link:${s.id}`}>Add to {s.name}</option>)}
              <option value="create">Create “{g.label}”</option>
              <option value="skip">Skip this subject</option>
            </select>
            <span className="import-count">{kept} of {g.rows.length}</span>
          </header>
          {g.rows.slice(0,take).map(r=><ImportRow key={r.key} row={r} action={g.action} overwrite={overwrite} onChange={p=>setRow(g.key,r.key,p)} onToggle={()=>setRow(g.key,r.key,{include:!r.include})}/>)}
          {g.rows.length>take&&<button className="text import-more" onClick={()=>setShowAll(true)}>Show the remaining {g.rows.length-take} records</button>}
        </section>})}
      </div>
      <div className="import-actions"><button onClick={onClose}>Cancel</button><button className="primary" disabled={!sum.ready} onClick={commit}>{sum.ready?`Confirm import of ${sum.ready} records`:'Nothing to import'}</button></div>
    </>}
    {stage==='done'&&<>
      <div className="success"><Check/> {saved.records} attendance {saved.records===1?'record':'records'} imported.</div>
      <div className="import-stats">
        <ImportStat label="Records saved" value={saved.records} tone="ready"/>
        <ImportStat label="Present" value={saved.present} tone="present"/>
        <ImportStat label="Absent" value={saved.absent} tone="absent"/>
        <ImportStat label="Subjects created" value={saved.subjects}/>
      </div>
      <p className="muted">Your percentages on Attendance and Statistics already include these.</p>
      <button className="primary full" onClick={()=>onDone(saved.records)}>Done</button>
    </>}
  </Modal>
}
function BackupModal({data,onClose}:{data:BackupPayload,onClose:()=>void}){const download=()=>{const blob=new Blob([makeBackup(data)],{type:'text/plain'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`self-attendance-backup-${data.createdAt.slice(0,10)}.txt`;a.click();URL.revokeObjectURL(url)};return <Modal onClose={onClose}><h2>Backup your data</h2><p>Your backup is readable text with a protected structured section for reliable restore. Store it somewhere safe.</p><ul><li>{data.subjects.length} subjects</li><li>{data.attendance.length} attendance records</li><li>{data.timetable.length} timetable sessions</li></ul><button className="primary full" onClick={download}><Download/> Download backup (.txt)</button></Modal>}
function RestoreModal({uid,onDone,onClose}:{uid:string,onDone:()=>void,onClose:()=>void}){const [data,setData]=useState<BackupPayload|null>(null),[error,setError]=useState(''),[mode,setMode]=useState<'merge'|'replace'>('merge');const input=useRef<HTMLInputElement>(null);const choose=async(f?:File)=>{if(!f)return;try{setError('');setData(parseBackup(await f.text()))}catch(e){setData(null);setError(e instanceof Error?e.message:'Could not read that backup.')}};return <Modal onClose={onClose}><h2>Restore backup</h2><p>Nothing changes until you confirm.</p><input ref={input} type="file" accept="text/plain,.txt" onChange={e=>choose(e.target.files?.[0])}/>{error&&<div className="error">{error}</div>}{data&&<><div className="success"><Check/> Found {data.subjects.length} subjects, {data.attendance.length} attendance records, and {data.timetable.length} timetable entries.</div><label className="choice"><input type="radio" checked={mode==='merge'} onChange={()=>setMode('merge')}/> Merge with existing data</label><label className="choice"><input type="radio" checked={mode==='replace'} onChange={()=>setMode('replace')}/> Replace existing data</label><button className="primary full" onClick={async()=>{await restore(uid,data,mode==='replace');onDone()}}>Confirm restore</button></>}</Modal>}
function Empty({title,text,action,onAction}:{title:string,text:string,action?:string,onAction?:()=>void}){return <section className="empty card"><BookOpen/><h2>{title}</h2><p>{text}</p>{action&&<button className="primary" onClick={onAction}>{action}</button>}</section>}
export default App;

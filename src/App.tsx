import { Component, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ErrorInfo, type ReactNode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { BarChart3, BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, CloudUpload, Download, FileSpreadsheet, FileText, Home, LogOut, Moon, Plus, RotateCcw, Settings as SettingsIcon, Sparkles, Trash2, TriangleAlert, Upload, X } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { ThinkingOrb } from 'thinking-orbs';
import { auth, firebaseConfigured, logout, signIn, type AuthUser } from './firebase';
import { cancelPendingPush, flushPendingPush, getLastSyncErrorReason, pushToCloud, removeAllUserData, syncOnLogin, type SyncStatus } from './sync';
import { clearUser, getLastQuarantineReport, id, importAttendanceData, importTimetableData, isReconciled, markDirty, put, remove, restore, setReconciled, userData, type QuarantineReport } from './db';
import { dateISO, overall, subjectStats, trend } from './math';
import { extractAttendance, extractTimetable, getGeminiApiKey, setGeminiApiKey } from './gemini';
import { analyse, annotate, buildWrites, summarise, validISO, willImport } from './attendance-import';
import { makeBackup, parseBackup } from './backup';
import type { Attendance, AttendanceStatus, BackupPayload, DetectedEntry, DetectedStatus, ReviewRow, Settings, Subject, SubjectGroup, TimetableEntry } from './types';
import { DAYS } from './types';
import { FloatingNav } from './components/FloatingNav';
import { MonthlyAttendance } from './components/MonthlyAttendance';
import { ExcelExportModal } from './components/ExcelExportModal';
import { QuickMarkModal } from './components/QuickMarkModal';
import { SubjectsPage } from './components/SubjectsPage';
import { useToday } from './hooks/useToday';
import { StorageChooser } from './components/StorageChooser';
import { ConflictModal } from './components/ConflictModal';
import { StorageMode, LOCAL_USER, getInitialStorageMode, setStorageMode, isLocalUid, LOCAL_UID } from './storage-mode';
import { createPreSyncSnapshot, executeConflictResolution, mergeUserData, type ConflictChoice, type UserDataset } from './sync-conflict';
import { doc, getDocFromServer } from 'firebase/firestore';
import { firestore } from './firebase';
import { HardDrive, Cloud } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { exportOrShareFile } from './native-file';

type Page='home'|'subjects'|'calendar'|'timetable'|'statistics'|'settings';
const colors=['#6d5dfc','#20c997','#ff8d5c','#e95d9a','#3989ff','#e0a526'];
const todayDay=()=>DAYS[(new Date().getDay()+6)%7];
const initialSubject=(uid:string, target:number):Subject=>({id:id(),uid,name:'',code:'',teacher:'',room:'',color:colors[0],target,createdAt:new Date().toISOString()});
// One colour per class type for the timetable badge. `e.type` comes from a fixed <select>, so these
// four cover every value the app writes — imported or older rows may hold anything else, which is
// what the `|| var(--brand)` fallback at the call site is for.
const TYPE_COLOR:Record<string,string>={Lecture:'#6d5dfc',Lab:'#20c997',Tutorial:'#ff8d5c',Seminar:'#3989ff'};
// A short tap when a class is marked. Android PWAs honour it; iOS and desktop ignore the call, and
// a page that has not been interacted with yet throws rather than vibrating — hence the guard.
const buzz=(ms=12)=>{try{navigator.vibrate?.(ms)}catch{}};
const reduceMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Marks the card that was just tapped so CSS can play a one-shot confirmation. The timer is cleared
// on unmount, so StrictMode's double mount cannot leave a setState aimed at a tree that is gone.
function useMarkFlash(ms=420) {
  const [flashed,setFlashed]=useState('');
  const timer=useRef<number>();
  useEffect(()=>()=>{if(timer.current)window.clearTimeout(timer.current)},[]);
  const fire=(key:string)=>{setFlashed(key);if(timer.current)window.clearTimeout(timer.current);timer.current=window.setTimeout(()=>setFlashed(''),ms)};
  return [flashed,fire] as const;
}
// Open / close motion from transitions.dev (06-modal): scale up on the open clock, dip back on
// the faster close clock. The close is delayed by --modal-close-dur so the exit actually plays.
const MODAL_CLOSE_MS=150;
export function Modal({children,onClose}:{children:React.ReactNode,onClose:()=>void}) {
  const [open,setOpen]=useState(false),[closing,setClosing]=useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(typeof document !== 'undefined' ? document.activeElement as HTMLElement | null : null);
  const titleId = useId();
  const [hasTitle, setHasTitle] = useState(false);

  useEffect(()=>{const r=requestAnimationFrame(()=>setOpen(true));return()=>cancelAnimationFrame(r)},[]);

  useEffect(()=>{
    const orig = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = orig; };
  },[]);

  useEffect(()=>{
    return () => { triggerRef.current?.focus?.(); };
  },[]);

  const close=()=>{
    setOpen(false);
    setClosing(true);
    window.setTimeout(onClose,MODAL_CLOSE_MS);
  };

  useEffect(()=>{
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  },[]);

  useEffect(()=>{
    const container = modalRef.current;
    if (!container) return;
    const h = container.querySelector('h1, h2, h3');
    if (h) {
      if (!h.id) h.id = titleId;
      setHasTitle(true);
    }
    const focusable = container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length > 0) {
      focusable[0].focus();
    }
  },[titleId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Tab') {
      const container = modalRef.current;
      if (!container) return;
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ));
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  };

  return (
    <div
      className={`scrim t-scrim${open?' is-open':''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={hasTitle ? titleId : undefined}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={modalRef}
        className={`modal t-modal${open?' is-open':closing?' is-closing':''}`}
      >
        <button className="icon close" onClick={close} aria-label="Close dialog">
          <X/>
        </button>
        {children}
      </div>
    </div>
  );
}
export class ErrorBoundary extends Component<{children: ReactNode}, {hasError: boolean}> {
  constructor(props: {children: ReactNode}) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="center" style={{padding: 24, textAlign: 'center'}}>
          <h2>Something went wrong</h2>
          <p className="muted" style={{marginBottom: 16}}>An unexpected error occurred.</p>
          <button className="primary" onClick={() => window.location.reload()}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppContent() {
  const [storageMode, setStorageModeState] = useState<StorageMode | null>(() => getInitialStorageMode());
  const [user,setUser]=useState<AuthUser|null>(null),[loading,setLoading]=useState(true),[page,setPage]=useState<Page>('home');
  const [subjects,setSubjects]=useState<Subject[]>([]),[records,setRecords]=useState<Attendance[]>([]),[table,setTable]=useState<TimetableEntry[]>([]),[settings,setSettings]=useState<Settings|null>(null);
  const [modal,setModal]=useState<'subject'|'entry'|'import'|'attendance-import'|'backup'|'restore'|'clear'|'excel-export'|'quick-mark'|null>(null),[editSubject,setEditSubject]=useState<Subject|null>(null),[editEntry,setEditEntry]=useState<TimetableEntry|null>(null),[toast,setToast]=useState('');
  const [syncStatus,setSyncStatus]=useState<SyncStatus>('idle'),[restoring,setRestoring]=useState(false),[jumpToday,setJumpToday]=useState(false),[syncFailed,setSyncFailed]=useState(false),[quarantineNotice,setQuarantineNotice]=useState<QuarantineReport|null>(null);
  const [conflictState, setConflictState] = useState<{
    cloudUid: string;
    authUser: AuthUser;
    localData: UserDataset;
    cloudData: UserDataset;
  } | null>(null);
  const uid=user?.uid ?? (storageMode === 'local' ? LOCAL_UID : '');
  // The toast stays mounted so it can animate out (transitions.dev 22-toast); the ref holds the
  // last message so the box is not empty while it leaves.
  const shownToast=useRef('');
  if(toast)shownToast.current=toast;
  // Real undo: `showUndo` drives whether the toast currently in view offers the action, while
  // `shownUndo` mirrors it through the close animation the same way `shownToast` does. The actual
  // record to restore lives in a ref (not state) since it never needs to trigger a render itself.
  const [showUndo,setShowUndo]=useState(false);
  const shownUndo=useRef(false);
  if(toast)shownUndo.current=showUndo;
  const undoTimer=useRef<number>();
  const pendingUndo=useRef<{subjectId:string,date:string,sessionId:string,prev?:Attendance}|null>(null);
  const flash=(m:string,undo=false)=>{
    setToast(m);setShowUndo(undo);
    if(undoTimer.current)window.clearTimeout(undoTimer.current);
    undoTimer.current=window.setTimeout(()=>{setToast('');setShowUndo(false);if(undo)pendingUndo.current=null},undo?6500:3500);
  };
  const prevUid=useRef<string>('');

  useEffect(() => {
    if (storageMode !== 'local') return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const d = await userData(LOCAL_UID);
      if (cancelled) return;
      setSubjects(d.subjects);
      setRecords(d.attendance);
      setTable(d.timetable);
      setSettings(d.settings);
      setUser(LOCAL_USER);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [storageMode]);

  useEffect(()=>{
    if (storageMode !== 'cloud') {
      if (storageMode === null) setLoading(false);
      return;
    }
    if(!auth){setLoading(false);return}
    let run=0;
    return onAuthStateChanged(auth,async u=>{
      const mine=++run;
      if(!u){
        if(run!==mine)return;
        if(prevUid.current){
          cancelPendingPush(prevUid.current);
          prevUid.current='';
        }
        cancelPendingPush();
        setUser(null);setLoading(false);setSyncStatus('idle');setRestoring(false);setSyncFailed(false);setQuarantineNotice(null);setPage('home');setSubjects([]);setRecords([]);setTable([]);setSettings(null);
        return;
      }
      if(prevUid.current && prevUid.current !== u.uid){
        cancelPendingPush(prevUid.current);
      }
      prevUid.current = u.uid;
      if(run!==mine)return;
      setLoading(true);

      const localDeviceData = await userData(LOCAL_UID);
      const hasLocalDeviceData = localDeviceData.subjects.length > 0 || localDeviceData.attendance.length > 0 || localDeviceData.timetable.length > 0;

      let cloudDocData: UserDataset | null = null;
      if (firestore) {
        try {
          const snap = await getDocFromServer(doc(firestore, 'users', u.uid));
          if (snap.exists()) {
            cloudDocData = snap.data() as UserDataset;
          }
        } catch {}
      }

      const hasCloudData = Boolean(
        cloudDocData &&
        (cloudDocData.subjects?.length > 0 || cloudDocData.attendance?.length > 0 || cloudDocData.timetable?.length > 0)
      );

      const isRec = await isReconciled(u.uid);
      const existingUData = await userData(u.uid);
      const hasExistingUData = existingUData.subjects.length > 0 || existingUData.attendance.length > 0 || existingUData.timetable.length > 0;

      const conflictLocalData = hasLocalDeviceData ? localDeviceData : (!isRec && hasExistingUData) ? existingUData : null;

      if (conflictLocalData && hasCloudData && cloudDocData) {
        if (run !== mine) return;
        setConflictState({
          cloudUid: u.uid,
          authUser: u,
          localData: conflictLocalData,
          cloudData: cloudDocData,
        });
        setLoading(false);
        return;
      } else if (hasLocalDeviceData && !hasCloudData) {
        await restore(u.uid, localDeviceData, true, true, true);
        await markDirty(u.uid);
        await setReconciled(u.uid, true);
        await clearUser(LOCAL_UID);
      }

      const show=async()=>{const d=await userData(u.uid);if(run!==mine)return;setSubjects(d.subjects);setRecords(d.attendance);setTable(d.timetable);setSettings(d.settings)};
      await put('users',{uid:u.uid,email:u.email??'',name:u.displayName??'',photoURL:u.photoURL??'',updatedAt:new Date().toISOString()});
      if(run!==mine)return;
      await show();
      if(run!==mine)return;
      setUser(u);setLoading(false);
      if(run!==mine)return;
      setRestoring(true);
      const syncRes = await syncOnLogin(u.uid,setSyncStatus);
      if(run!==mine)return;
      await show();
      if(run!==mine)return;
      setRestoring(false);
      setSyncFailed(syncRes==='failed');
      const qr = getLastQuarantineReport();
      if(qr && qr.totalQuarantined > 0) setQuarantineNotice(qr);
    });
  },[storageMode]);
 // `system` was written straight to data-theme, where it matched no CSS rule — so the default
 // setting never went dark whatever the OS said. Resolve it here instead, and follow the OS live.
 // The dark/light class is what keeps <ThinkingOrb theme="auto"> in step: it reads a dark or light
 // class off an ancestor, and `amoled` is not a name it knows.
 useEffect(()=>{
   const choice=settings?.theme??'system';
   const mq=window.matchMedia('(prefers-color-scheme: dark)');
   const apply=()=>{
     const resolved=choice==='system'?'dark':choice;
     const root=document.documentElement,dark=resolved!=='light';
     root.dataset.theme=resolved;
     root.classList.toggle('dark',dark);
     root.classList.toggle('light',!dark);
     document.querySelector('meta[name="theme-color"]')?.setAttribute('content',resolved==='amoled'?'#000000':dark?'#080A12':'#f6f6fb');
   };
   apply();
   mq.addEventListener('change',apply);
   return ()=>mq.removeEventListener('change',apply);
 },[settings?.theme]);
 // The FAB asks for the jump and switches to Home; the scroll itself waits until Home is the page
 // on screen, so it works both from another tab and from Home (where the navigate is a no-op and
 // this runs on the same pass). Today's classes always renders its section — empty day included —
 // so the target is there whatever the timetable says.
 useEffect(()=>{
   if(!jumpToday||page!=='home')return;
   document.getElementById('todays-classes')?.scrollIntoView({behavior:reduceMotion()?'auto':'smooth',block:'start'});
   setJumpToday(false);
 },[jumpToday,page]);
 useEffect(()=>{
   const handleHide=()=>{if(uid)flushPendingPush(uid)};
   window.addEventListener('pagehide',handleHide);
   const handleVis=()=>{if(document.visibilityState==='hidden'&&uid)flushPendingPush(uid)};
   document.addEventListener('visibilitychange',handleVis);
   return ()=>{
     window.removeEventListener('pagehide',handleHide);
     document.removeEventListener('visibilitychange',handleVis);
   };
 },[uid]);
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
      StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
      StatusBar.setBackgroundColor({ color: '#080A12' }).catch(() => {});
    }
  }, []);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let removeListener: (() => void) | undefined;
    CapApp.addListener('backButton', () => {
      if (modal) {
        setModal(null);
      } else if (conflictState) {
        setConflictState(null);
      } else if (page !== 'home') {
        setPage('home');
      } else {
        void CapApp.exitApp();
      }
    }).then(handle => {
      removeListener = () => { void handle.remove(); };
    });
    return () => {
      removeListener?.();
    };
  }, [modal, conflictState, page]);
 const reload=async(push=true)=>{if(!uid)return;const d=await userData(uid);setSubjects(d.subjects);setRecords(d.attendance);setTable(d.timetable);setSettings(d.settings);if(push)pushToCloud(uid,setSyncStatus)};
 const saveSubject=async(s:Subject)=>{await put('subjects',s);await reload();setModal(null);flash('Subject saved')};
 const deleteSubject=async(s:Subject, history:boolean)=>{
    if(!confirm(`Delete ${s.name}?`))return;
    const linkedEntries=table.filter(t=>t.subjectId===s.id);
    if(linkedEntries.length>0){
      const deleteTable=confirm(`Delete ${linkedEntries.length} timetable class(es) for ${s.name} as well?\n\nClick OK to delete them, or Cancel to keep them unlinked.`);
      if(deleteTable){
        await Promise.all(linkedEntries.map(e=>remove('timetable',e.id)));
      }else{
        await Promise.all(linkedEntries.map(e=>put('timetable',{...e,subjectId:''})));
      }
    }
    await remove('subjects',s.id);
    if(history)await Promise.all(records.filter(r=>r.subjectId===s.id).map(r=>remove('attendance',r.id)));
    await reload();
    flash(history?'Subject and history deleted':'Subject deleted; attendance history preserved');
  };
 const marking=useRef(new Set<string>());
 const mark=async(subjectId:string,status:AttendanceStatus,date=dateISO(),sessionId='manual')=>{
    // Drop a second tap on the same subject+date+session while the first write is still in flight;
    // otherwise both taps see no existing record and each create one.
    const lock=`${subjectId}|${date}|${sessionId}`;
    if(marking.current.has(lock))return;
    marking.current.add(lock);
    try{await markNow(subjectId,status,date,sessionId)}finally{marking.current.delete(lock)}
 };
 const markNow=async(subjectId:string,status:AttendanceStatus,date:string,sessionId:string)=>{
    buzz();
    const dayOfWeek=DAYS[(new Date(date+'T12:00').getDay()+6)%7];
    const defaultEntry=table.find(t=>t.day===dayOfWeek&&t.subjectId===subjectId);
    const timetableEntry=table.find(t=>t.id===sessionId)||defaultEntry;
    const resolvedSessionId=timetableEntry?timetableEntry.id:sessionId;
    const old=records.find(r=>r.subjectId===subjectId&&r.date===date&&r.sessionId===resolvedSessionId)
      ?? records.find(r=>r.subjectId===subjectId&&r.date===date&&r.sessionId===sessionId)
      ?? records.find(r=>r.subjectId===subjectId&&r.date===date&&(r.sessionId==='manual'||!table.some(t=>t.id===r.sessionId)));
    const targetSessionId=old?.sessionId??resolvedSessionId;
    if(status==='unmarked'){
      if(old){
        await remove('attendance',old.id);
        await reload();
        pendingUndo.current={subjectId,date,sessionId:targetSessionId,prev:old};
        flash('Attendance cleared',true);
      }
      return;
    }
    const item:Attendance={
      id:old?.id??id(),
      uid,
      subjectId,
      date,
      sessionId:targetSessionId,
      timetableId: timetableEntry?.id,
      startTime: old?.startTime ?? timetableEntry?.startTime,
      endTime: old?.endTime ?? timetableEntry?.endTime,
      room: old?.room ?? timetableEntry?.room,
      isExtra: old?.isExtra ?? (!timetableEntry),
      status,
      updatedAt:new Date().toISOString()
    };
    await put('attendance',item);await reload();
    pendingUndo.current={subjectId,date,sessionId:targetSessionId,prev:old};
    flash(`Marked ${status}`,true);
  };
 // Reverses exactly the record `mark` last touched: puts the prior record back if there was one,
 // otherwise deletes the one `mark` created. Works regardless of how much time or navigation
 // happened in between, as long as the undo window (see `flash`) hasn't closed.
 const undoMark=async()=>{
   const p=pendingUndo.current;if(!p)return;pendingUndo.current=null;
   if(undoTimer.current)window.clearTimeout(undoTimer.current);
   if(p.prev)await put('attendance',p.prev);
   else{const cur=records.find(r=>r.subjectId===p.subjectId&&r.date===p.date&&r.sessionId===p.sessionId);if(cur)await remove('attendance',cur.id)}
   await reload();setToast('');setShowUndo(false);flash('Undone');
 };
 const saveEntry=async(e:TimetableEntry,newSubject?:Subject)=>{if(newSubject)await put('subjects',newSubject);await put('timetable',e);await reload();setModal(null);flash('Timetable saved')};
 const retryLoginSync=async()=>{if(!uid)return;setSyncFailed(false);setRestoring(true);const res=await syncOnLogin(uid,setSyncStatus);const d=await userData(uid);setSubjects(d.subjects);setRecords(d.attendance);setTable(d.timetable);setSettings(d.settings);setRestoring(false);setSyncFailed(res==='failed')};
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  const handleSelectMode = async (mode: StorageMode) => {
    setAuthError('');
    if (mode === 'local') {
      await setStorageMode('local');
      setStorageModeState('local');
      setUser(LOCAL_USER);
      return;
    }
    setAuthBusy(true);
    setStorageModeState('cloud');
    void setStorageMode('cloud');
    try {
      await signIn();
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'That sign-in did not go through. Check your connection and try again.');
    } finally {
      setAuthBusy(false);
    }
  };

  const backToStorageChooser = async () => {
    setAuthError('');
    await setStorageMode(null);
    setStorageModeState(null);
  };

  const switchToCloud = async () => {
    setAuthError('');
    setAuthBusy(true);
    try {
      await signIn();
      await setStorageMode('cloud');
      setStorageModeState('cloud');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Sign in failed');
    } finally {
      setAuthBusy(false);
    }
  };

  const switchToLocal = async () => {
    if (uid && uid !== LOCAL_UID) {
      try {
        await Promise.race([flushPendingPush(uid), new Promise(r => setTimeout(r, 2000))]);
      } catch {}
      cancelPendingPush(uid);
      const currentData = await userData(uid);
      await restore(LOCAL_UID, currentData, true, true, false);
    }
    await logout();
    await setStorageMode('local');
    setStorageModeState('local');
    setUser(LOCAL_USER);
    setSyncStatus('idle');
    flash('Switched to Local mode. Data preserved on device.');
  };

  const handleConflictResolution = async (choice: ConflictChoice) => {
    if (!conflictState) return;
    const { cloudUid, authUser, localData, cloudData } = conflictState;
    setLoading(true);
    try {
      await executeConflictResolution(cloudUid, choice, localData, cloudData);
      await clearUser(LOCAL_UID);
      await setStorageMode('cloud');
      setStorageModeState('cloud');
      const d = await userData(cloudUid);
      setSubjects(d.subjects);
      setRecords(d.attendance);
      setTable(d.timetable);
      setSettings(d.settings);
      setUser(authUser);
      setSyncStatus('synced');
      flash('Sync conflict resolved');
    } catch {
      flash('Failed to resolve sync conflict');
    } finally {
      setConflictState(null);
      setLoading(false);
    }
  };

 const stats=useMemo(()=>overall(subjects,records),[subjects,records]);
 const navigate=(p:Page)=>setPage(p);
 if (storageMode === null) return <StorageChooser onSelectMode={handleSelectMode} busy={authBusy} error={authError} />;
 if(loading)return <div className="center"><ThinkingOrb state="breathing" size={64} aria-label="Loading"/>Loading your attendance…</div>;
 if (conflictState) {
   return (
     <div className="app">
       <ConflictModal
         localData={conflictState.localData}
         cloudData={conflictState.cloudData}
         onResolve={handleConflictResolution}
         onClose={() => setConflictState(null)}
       />
     </div>
   );
 }
 if(!user || (storageMode === 'cloud' && isLocalUid(user.uid))) return <StorageChooser onSelectMode={handleSelectMode} busy={authBusy} error={authError} />;
  if(!settings)return <div className="center"><ThinkingOrb state="breathing" size={64} aria-label="Loading"/>Loading your settings…</div>;
  if(syncFailed&&!subjects.length&&!records.length){
    const r=getLastSyncErrorReason();
    const msg = r==='invalid_data'
      ? 'Your cloud copy contains invalid data and could not be restored.'
      : r==='payload_too_large'
      ? "Your cloud copy exceeds Firestore's 1 MB document limit and cannot be synced."
      : "Couldn't reach your cloud copy. Check your internet connection and retry.";
    return <div className="center"><p style={{marginBottom:16}}>{msg}</p><button className="primary" onClick={retryLoginSync}>Retry</button></div>;
  }
 if(restoring)return <div className="center"><ThinkingOrb state="connecting" size={64} aria-label="Restoring"/>Syncing your attendance…</div>;
 const nav=[['home',Home,'Home'],['subjects',BookOpen,'Subjects'],['calendar',CalendarDays,'Calendar'],['timetable',Clock3,'Timetable'],['statistics',BarChart3,'Reports'],['settings',SettingsIcon,'Settings']] as const;
 return <div className="app"><aside><Brand/><nav>{nav.map(([p,I,l])=><button key={p} className={page===p?'active':''} onClick={()=>navigate(p)}><I/><span>{l}</span></button>)}</nav><Profile user={user} storageMode={storageMode} onSignIn={switchToCloud}/></aside><main className={`page-${page}`}>
 {page==='home'&&<div className="dashboard-atmosphere" aria-hidden="true">
   <div className="atmo-aurora" />
   <div className="atmo-overlay" />
 </div>}
 <header className="app-header"><div className="header-welcome"><p className="eyebrow">{new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}</p><h1>{page==='home'?'Good to see you':page==='statistics'?'Reports & Analytics':page==='subjects'?'Subjects':page[0].toUpperCase()+page.slice(1)}</h1>{page==='home'&&<p className="header-subtitle">Keep showing up <span className="sparkle-icon" aria-hidden="true">✨</span></p>}</div><div className="header-actions"><SyncBadge status={syncStatus} mode={storageMode} onSignIn={switchToCloud}/><button className="avatar" onClick={()=>navigate('settings')} aria-label="Settings"><UserAvatar user={user} alt="" showFallback/></button></div></header>
 {getLastSyncErrorReason()==='payload_too_large'&&<div className="card" style={{margin:'0 0 16px',border:'1px solid var(--absent,#ff5c5c)',padding:'12px 16px'}}><b>Cloud sync paused: 1 MB limit exceeded</b><p className="muted" style={{margin:'4px 0 0',fontSize:13}}>Your attendance records exceed Firestore's 1 MiB document limit. Export your data to Excel or JSON and delete older records to resume cloud sync.</p></div>}
 {quarantineNotice&&quarantineNotice.totalQuarantined>0&&<div className="card" style={{margin:'0 0 16px',border:'1px solid var(--absent,#ff5c5c)',display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,padding:'12px 16px'}}><div><b>{quarantineNotice.totalQuarantined} items could not be restored</b><p className="muted" style={{margin:0,fontSize:13}}>Some records from your cloud copy were malformed and were safely skipped.</p></div><div style={{display:'flex',gap:8}}><button className="secondary" onClick={()=>{const b=new Blob([JSON.stringify(quarantineNotice.quarantined,null,2)],{type:'application/json'});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=`skipped-records-${dateISO()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(u),10000)}}><Download size={14}/> Download skipped</button><button className="icon" onClick={()=>setQuarantineNotice(null)} aria-label="Dismiss"><X size={16}/></button></div></div>}
 {page==='home'&&<Dashboard subjects={subjects} records={records} table={table} stats={stats} defaultTarget={settings?.defaultTarget??75} restoring={restoring} onMark={mark} onAdd={()=>{setEditSubject(initialSubject(uid,settings?.defaultTarget??75));setModal('subject')}} onEdit={s=>{setEditSubject(s);setModal('subject')}} onNav={navigate}/>} 
 {page==='subjects'&&<SubjectsPage subjects={subjects} records={records} onAdd={()=>{setEditSubject(initialSubject(uid,settings?.defaultTarget??75));setModal('subject')}} onEdit={s=>{setEditSubject(s);setModal('subject')}} onMark={mark}/>}
 {page==='calendar'&&<CalendarPage subjects={subjects} records={records} table={table} onMark={mark} onImport={()=>setModal('attendance-import')} onOpenMonthly={()=>navigate('statistics')}/>} {page==='timetable'&&<TimetablePage subjects={subjects} table={table} onEdit={e=>{setEditEntry(e);setModal('entry')}} onDelete={async e=>{if(confirm('Delete this class?')){await remove('timetable',e.id);await reload()}}} onImport={()=>setModal('import')}/>} {page==='statistics'&&<Statistics subjects={subjects} records={records} table={table} stats={stats} restoring={restoring} onExportExcel={()=>setModal('excel-export')}/>} {page==='settings'&&<SettingsPage user={user} settings={settings} subjects={subjects} records={records} table={table} syncStatus={syncStatus} storageMode={storageMode} onSwitchToCloud={switchToCloud} onSwitchToLocal={switchToLocal} onOpenSignIn={switchToCloud} onBackToStorageOptions={backToStorageChooser} onSettings={async s=>{await put('settings',s);setSettings(s);pushToCloud(uid,setSyncStatus)}} onBackup={()=>setModal('backup')} onRestore={()=>setModal('restore')} onImportAttendance={()=>setModal('attendance-import')} onClear={()=>setModal('clear')} onLogout={async()=>{const targetUid=uid||prevUid.current;if(typeof navigator!=='undefined'&&navigator.onLine&&targetUid){try{await Promise.race([flushPendingPush(targetUid),new Promise(r=>setTimeout(r,2000))])}catch{}}if(targetUid)cancelPendingPush(targetUid);cancelPendingPush();prevUid.current='';await logout();setSubjects([]);setRecords([]);setTable([]);setSettings(null);setSyncStatus('idle');setPage('home')}}/>}
 </main><FloatingNav activeKey={page} onNavigate={navigate}/><button className={`fab-today${page==='home'?' is-home':''}`} onClick={()=>{setJumpToday(true);navigate('home')}} aria-label="Go to today's classes"><Clock3/><span>Today</span></button><div className={`toast t-toast${toast?' is-open':''}`} role="status" aria-live="polite"><span>{shownToast.current}</span>{shownUndo.current&&<button className="toast-undo" onClick={undoMark}>Undo</button>}</div>
 {modal==='subject'&&editSubject&&<SubjectForm subject={editSubject} onSave={saveSubject} onDelete={editSubject.name?deleteSubject:undefined} onClose={()=>setModal(null)}/>} {modal==='entry'&&editEntry&&<EntryForm entry={editEntry} subjects={subjects} onSave={saveEntry} onClose={()=>setModal(null)}/>} {modal==='import'&&<ImportModal uid={uid} subjects={subjects} table={table} defaultTarget={settings?.defaultTarget??75} onSaved={async()=>{await reload();setModal(null);flash('Timetable imported')}} onClose={()=>setModal(null)}/>} {modal==='attendance-import'&&<AttendanceImportModal uid={uid} subjects={subjects} records={records} defaultTarget={settings?.defaultTarget??75} onCommitted={reload} onDone={(n:number)=>{setModal(null);flash(`${n} attendance records imported`)}} onClose={()=>setModal(null)}/>} {modal==='backup'&&<BackupModal data={{version:1,createdAt:new Date().toISOString(),account:{email:user.email??'',uid},subjects,attendance:records,timetable:table,settings:settings}} onClose={()=>setModal(null)}/>} {modal==='restore'&&<RestoreModal uid={uid} onDone={async()=>{await reload();setModal(null);flash('Backup restored')}} onClose={()=>setModal(null)}/>} {modal==='clear'&&<Modal onClose={()=>setModal(null)}><h2>Remove all data?</h2><p>{storageMode === 'local' ? 'This permanently removes all your attendance records, subjects, timetable, and settings from this device. This action cannot be undone.' : 'This permanently removes all your attendance records, subjects, timetable, and settings from everywhere — both this device and your Google Cloud account. This action cannot be undone.'}</p>
 <button className="danger full" onClick={async()=>{await removeAllUserData(uid, setSyncStatus);await reload(false);setModal(null);flash('All data removed')}}>Remove all data</button></Modal>}
 {modal==='excel-export'&&<ExcelExportModal subjects={subjects} records={records} table={table} currentYear={new Date().getFullYear()} currentMonth={new Date().getMonth()} studentName={user.displayName??''} studentEmail={user.email??''} onSuccess={(fn,cnt)=>flash(`Exported ${cnt} records to ${fn}`)} onClose={()=>setModal(null)}/>}
 {modal==='quick-mark'&&<QuickMarkModal subjects={subjects} records={records} table={table} onMark={mark} onNavigateHome={()=>{setModal(null);navigate('home')}} onClose={()=>setModal(null)}/>}
 </div>
}
function Brand(){return <div className="brand"><span>✓</span><b>Self Attendance</b></div>}
function SyncBadge({status, mode, onSignIn}:{status:SyncStatus, mode?: StorageMode | null, onSignIn?: () => void}){
  if (mode === 'local') {
    if (onSignIn) {
      return (
        <button
          type="button"
          className="sync-badge local sync-badge-btn"
          onClick={onSignIn}
          title="Sign in with Google to sync across devices"
        >
          <i className="dot"/>Local only · <u>Sign in</u>
        </button>
      );
    }
    return <span className="sync-badge local"><i className="dot"/>Local only</span>;
  }
  const effectiveStatus = status === 'idle' ? 'synced' : status;
  const reason=getLastSyncErrorReason();
  const errorLabel=reason==='payload_too_large'?'Limit exceeded (>1MB)':'Sync paused — retrying';
  const label={syncing:'Syncing…',synced:'Synced',offline:'Offline — will sync later',error:errorLabel}[effectiveStatus];
  return <span className={`sync-badge ${effectiveStatus}`} title={reason==='payload_too_large'?"Data exceeds Firestore's 1MB limit. Export or remove older records.":undefined}>{effectiveStatus==='syncing'?<ThinkingOrb state="connecting" size={20} aria-label="Syncing"/>:<i className="dot"/>}{label}</span>
}
export function UserAvatar({user, alt, showFallback = false}:{user:AuthUser, alt?:string, showFallback?:boolean}){
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = user.photoURL;
  if (src && failedSrc !== src) {
    return (
      <img
        src={src}
        alt={alt ?? (user.displayName || 'Profile')}
        referrerPolicy="no-referrer"
        onError={() => setFailedSrc(src)}
      />
    );
  }
  if (!showFallback) return null;
  return <span className="avatar-initial">{(user.displayName || user.email || '?')[0].toUpperCase()}</span>;
}
export function Profile({user, storageMode, onSignIn}:{user:AuthUser, storageMode?: StorageMode | null, onSignIn?: () => void}){
  return (
    <div className="profile">
      <UserAvatar user={user} alt={user.displayName||'Profile'}/>
      <div style={{flex:1,minWidth:0}}>
        <b>{user.displayName}</b>
        <small>{storageMode === 'local' ? 'Stored on this device' : user.email}</small>
        {storageMode === 'local' && onSignIn && (
          <button type="button" className="text" onClick={onSignIn} style={{marginTop:4,fontSize:11,display:'block'}}>
            Sign in with Google →
          </button>
        )}
      </div>
    </div>
  );
}
function parseHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}
function Dashboard({subjects,records,table,stats,defaultTarget=75,restoring,onMark,onAdd,onEdit,onNav}:{subjects:Subject[];records:Attendance[];table:TimetableEntry[];stats:ReturnType<typeof overall>;defaultTarget?:number;restoring:boolean;onMark:(id:string,s:AttendanceStatus,date?:string,sessionId?:string)=>void;onAdd:()=>void;onEdit:(s:Subject)=>void;onNav:(p:Page)=>void}) {
  const { todayDay: currentTodayDay, nowTime } = useToday();
  const time=nowTime, today=table.filter(t=>t.day===currentTodayDay).sort((a,b)=>a.startTime.localeCompare(b.startTime));
  const currentClass=today.find(t=>t.startTime<=time&&t.endTime>time), next=today.find(t=>t.startTime>time);
  const [flashed,fireFlash]=useMarkFlash();

  const clampedPct = Math.min(100, Math.max(0, stats.pct));
  const ringRadius = 46;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDashOffset = ringCircumference * (1 - clampedPct / 100);

  const deltaVal = stats.total > 0 ? Math.round(stats.pct - defaultTarget) : 0;
  const deltaBadgeText = stats.total === 0 ? `Target ${defaultTarget}%` : deltaVal >= 0 ? `↗ +${Math.max(1, deltaVal)}%` : `Target ${defaultTarget}%`;
  const encouragementText = stats.total === 0
    ? 'Add subjects & mark your first class'
    : stats.pct >= 65
    ? "You're doing great! Keep it up."
    : `Attend upcoming classes to reach ${defaultTarget}%`;

  const currentSubName = currentClass ? (subjects.find(s => s.id === currentClass.subjectId)?.name || currentClass.subject) : '';
  const nextSubName = next ? (subjects.find(s => s.id === next.subjectId)?.name || next.subject) : '';

  let rhythmPct = 0;
  let minsLeft = 0;
  if (currentClass) {
    const startM = parseHHMM(currentClass.startTime);
    const endM = parseHHMM(currentClass.endTime);
    const nowM = parseHHMM(time);
    const duration = Math.max(1, endM - startM);
    const elapsed = Math.min(duration, Math.max(0, nowM - startM));
    rhythmPct = Math.round((elapsed / duration) * 100);
    minsLeft = Math.max(0, endM - nowM);
  }

  const scrollToToday = () => {
    document.getElementById('todays-classes')?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
  };

  return <>
    <section className="dashboard-hero-stack">
      {/* 1. Premium Overall Attendance Card */}
      <article className="overall card luxury-overall">
        <div className="overall-ambient-waves" aria-hidden="true" />
        <div className="overall-top-row">
          <div className="overall-title-group">
            <span className="overall-icon-box" aria-hidden="true">
              <BarChart3 size={17} />
            </span>
            <p>Overall attendance</p>
          </div>
          <span className="semester-pill">
            <span>This Semester</span>
          </span>
        </div>

        <div className="overall-body-row">
          <div className="overall-metrics">
            <div className="overall-pct-row">
              <h2>{stats.pct.toFixed(0)}<small>%</small></h2>
              <span className={`overall-delta-badge${stats.pct < 60 && stats.total > 0 ? ' is-warn' : ''}`}>
                {deltaBadgeText}
              </span>
            </div>
            <span className="overall-counts">
              <b>{stats.present}</b> present <i className="dot-sep">·</i> <b>{stats.absent}</b> absent
            </span>
            <button type="button" className="overall-encouragement-pill" onClick={() => onNav('statistics')}>
              <span className="target-bullseye" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <circle cx="12" cy="12" r="5" />
                  <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                  <path d="M16 8l4-4M17 4h3v3" />
                </svg>
              </span>
              <span className="encouragement-text">{encouragementText}</span>
              <ChevronRight size={14} className="pill-arrow" />
            </button>
          </div>

          <div className="ring luxury-ring" style={{'--p':`${stats.pct}%`} as CSSProperties}>
            <svg className="ring-svg" viewBox="0 0 112 112" aria-hidden="true">
              <defs>
                <linearGradient id="luxuryRingGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#38BDF8" />
                  <stop offset="35%" stopColor="#6366F1" />
                  <stop offset="70%" stopColor="#C084FC" />
                  <stop offset="92%" stopColor="#F472B6" />
                  <stop offset="100%" stopColor="#FFFFFF" />
                </linearGradient>
              </defs>
              <circle className="ring-track" cx="56" cy="56" r={ringRadius} />
              <circle
                className="ring-progress"
                cx="56"
                cy="56"
                r={ringRadius}
                stroke="url(#luxuryRingGrad)"
                strokeDasharray={ringCircumference}
                strokeDashoffset={ringDashOffset}
              />
            </svg>
            <div className="ring-inner-label">
              <b>{stats.total}</b>
              <small>classes</small>
            </div>
          </div>
        </div>
      </article>

      {/* 2. Four Quick Access Shortcut Cards */}
      <section className="quick-access-grid" aria-label="Quick access shortcuts">
        <button type="button" className="qa-card qa-violet" onClick={() => onNav('timetable')}>
          <span className="qa-icon-box" aria-hidden="true">
            <CalendarDays size={20} />
          </span>
          <b className="qa-title">Timetable</b>
          <small className="qa-desc">View schedule</small>
        </button>

        <button type="button" className="qa-card qa-amber" onClick={() => onNav('subjects')}>
          <span className="qa-icon-box" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
              <path d="M22 12A10 10 0 0 0 12 2v10z" />
            </svg>
          </span>
          <b className="qa-title">Subjects</b>
          <small className="qa-desc">Manage subjects</small>
        </button>

        <button type="button" className="qa-card qa-emerald" onClick={() => onNav('statistics')}>
          <span className="qa-icon-box" aria-hidden="true">
            <BarChart3 size={20} />
          </span>
          <b className="qa-title">Reports</b>
          <small className="qa-desc">Detailed insights</small>
        </button>

        <button type="button" className="qa-card qa-rose" onClick={() => onNav('calendar')}>
          <span className="qa-icon-box" aria-hidden="true">
            <CalendarDays size={20} />
          </span>
          <b className="qa-title">Calendar</b>
          <small className="qa-desc">Monthly view</small>
        </button>
      </section>

      {/* 3. Today's Rhythm Card */}
      <article className="card today luxury-rhythm">
        <div className="rhythm-classroom-art" aria-hidden="true">
          <div className="rhythm-ambient-glow" />
        </div>

        <div className="rhythm-top-row">
          <div className="rhythm-title-group">
            <span className="rhythm-icon-box" aria-hidden="true">
              <BarChart3 size={15} />
            </span>
            <p>Today’s rhythm</p>
          </div>
          <span className="rhythm-date-chip">
            <span className="sun-badge" aria-hidden="true">☀️</span>
            {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
          </span>
        </div>

        {!today.length ? (
          <div className="rhythm-body">
            <h3>Nothing scheduled</h3>
            <span className="rhythm-meta">Add your timetable to see class cues here.</span>
            <button type="button" className="rhythm-next-pill" onClick={() => onNav('timetable')}>
              <span className="hourglass-icon" aria-hidden="true">⌛</span>
              <span className="rhythm-next-text">Set up your recurring timetable</span>
              <ChevronRight size={15} />
            </button>
          </div>
        ) : currentClass ? (
          <div className="rhythm-body">
            <h3>Now · {currentSubName}</h3>
            <span className="rhythm-meta">
              {currentClass.startTime} – {currentClass.endTime} <i className="dot-sep">·</i> {currentClass.room || 'Room TBA'} <i className="dot-sep">·</i> {currentClass.type}
            </span>
            <div className="rhythm-progress-row">
              <div className="rhythm-progress-track">
                <i className="rhythm-progress-fill" style={{ width: `${Math.max(8, rhythmPct)}%` }} />
              </div>
              <small className="rhythm-mins-left">{minsLeft} min left</small>
            </div>
            <button type="button" className="rhythm-next-pill" onClick={scrollToToday}>
              <span className="hourglass-icon" aria-hidden="true">⌛</span>
              <span className="rhythm-next-text">
                {next ? <>Next: <b>{nextSubName}</b> at {next.startTime}</> : <>Final scheduled class for today</>}
              </span>
              <ChevronRight size={15} />
            </button>
          </div>
        ) : next ? (
          <div className="rhythm-body">
            <h3>Next · {nextSubName}</h3>
            <span className="rhythm-meta">
              {next.startTime} – {next.endTime} <i className="dot-sep">·</i> {next.room || 'Room TBA'} <i className="dot-sep">·</i> {next.type}
            </span>
            <div className="rhythm-progress-row">
              <div className="rhythm-progress-track">
                <i className="rhythm-progress-fill" style={{ width: '0%' }} />
              </div>
              <small className="rhythm-mins-left">Starts at {next.startTime}</small>
            </div>
            <button type="button" className="rhythm-next-pill" onClick={scrollToToday}>
              <span className="hourglass-icon" aria-hidden="true">⌛</span>
              <span className="rhythm-next-text">Next: <b>{nextSubName}</b> at {next.startTime}</span>
              <ChevronRight size={15} />
            </button>
          </div>
        ) : (
          <div className="rhythm-body">
            <h3>College over</h3>
            <span className="rhythm-meta">Nice work — today’s classes are done.</span>
            <div className="rhythm-progress-row">
              <div className="rhythm-progress-track">
                <i className="rhythm-progress-fill" style={{ width: '100%' }} />
              </div>
              <small className="rhythm-mins-left">Done for today</small>
            </div>
            <button type="button" className="rhythm-next-pill" onClick={scrollToToday}>
              <span className="hourglass-icon" aria-hidden="true">⌛</span>
              <span className="rhythm-next-text">Review today’s {today.length} {today.length === 1 ? 'class' : 'classes'}</span>
              <ChevronRight size={15} />
            </button>
          </div>
        )}
      </article>
    </section>

    <TodaysClasses entries={today} subjects={subjects} records={records} currentId={currentClass?.id} nextId={next?.id} restoring={restoring&&!table.length} onMark={onMark} onSetup={()=>onNav('timetable')}/>
    <section className="section-title"><div><h2>Your subjects</h2><p>One tap is all it takes.</p></div><button className="primary" onClick={onAdd}><Plus/> Add subject</button></section>
    {restoring&&!subjects.length?<SkeletonSubjects/>:!subjects.length?<Empty title="Start with your subjects" text="Add a subject or import your timetable, then your attendance will come to life." action="Add your first subject" onAction={onAdd}/>:<section className="subject-grid">{subjects.map(s=>{const x=subjectStats(s,records);return <article className={`subject card${flashed===s.id?' card-flash':''}`} key={s.id} style={{'--accent':s.color} as CSSProperties}><div className="subject-top"><span className="subject-icon">{s.code.slice(0,2)||'•'}</span><button className="more" onClick={()=>onEdit(s)} aria-label={`Edit ${s.name}`}>•••</button></div><h3>{s.name}</h3><p>{s.code||'No code'} · {s.teacher||'Teacher not set'}</p><div className="percent"><b>{x.pct.toFixed(0)}%</b><span>{x.present} / {x.total} classes</span></div><div className="progress"><i style={{width:`${Math.min(x.pct,100)}%`}}/></div><small className={x.state}>{x.total===0?'No classes yet':x.state!=='risk'?`Safe to miss ${x.bunk} classes`:x.required===-1?'Target 100% unreachable':`Attend next ${x.required} to reach ${s.target}%`}</small><div className="mark"><button aria-label="Mark absent" className="absent" onClick={()=>{fireFlash(s.id);onMark(s.id,'absent')}}>−</button><button aria-label="Mark present" className="present" onClick={()=>{fireFlash(s.id);onMark(s.id,'present')}}><Check/> Present</button></div></article>})}</section>}
  </>
}
// Today's Classes: the P0 "one tap, most common path" surface. Each card is tied to its own
// timetable entry (`sessionId=entry.id`), so two sessions of the same subject on the same day —
// a lecture and a lab, say — carry independent marks instead of clobbering one shared record.
// The `id` lives on the outer section, which renders on every branch — restoring, empty day and
// full list alike. That keeps the FAB's scroll target present at all times and means the id can
// never appear twice, which it would if the skeleton carried its own copy of it.
function TodaysClasses({entries,subjects,records,currentId,nextId,restoring,onMark,onSetup}:{entries:TimetableEntry[];subjects:Subject[];records:Attendance[];currentId?:string;nextId?:string;restoring:boolean;onMark:(id:string,s:AttendanceStatus,date?:string,sessionId?:string)=>void;onSetup:()=>void}){
  const { todayISO } = useToday();
  const date=todayISO;
  const [flashed,fireFlash]=useMarkFlash();
  const hit=(e:TimetableEntry,s:AttendanceStatus)=>{fireFlash(e.id);onMark(e.subjectId,s,date,e.id)};
  return <section id="todays-classes" className="todays-classes">
    <div className="section-title todays-classes-header">
      <div>
        <h2>Today’s classes</h2>
        <p>{restoring?'Fetching your timetable…':entries.length?'One tap marks the class':'Nothing on the timetable for today'}</p>
      </div>
      <button type="button" className="view-timetable-pill" onClick={onSetup}>
        <span>View timetable</span>
        <span aria-hidden="true">→</span>
      </button>
    </div>
    {restoring?<SkeletonToday/>:!entries.length?<Empty title="No classes today" text="Enjoy the day off, or set up your timetable if this looks wrong." action="Set up timetable" onAction={onSetup}/>:<div className="today-list">
      {entries.map((e, idx)=>{
        const subject=subjects.find(s=>s.id===e.subjectId);
        const record=records.find(r=>r.subjectId===e.subjectId&&r.date===date&&r.sessionId===e.id) ?? records.find(r=>r.subjectId===e.subjectId&&r.date===date&&(r.sessionId==='manual'||!entries.some(t=>t.id===r.sessionId)));
        const status=record?.status;
        const displayName=subject?.name||e.subject;
        const isOrphan=!subject;
        const accentColor = subject?.color ?? colors[idx % colors.length];
        const dotColor = TYPE_COLOR[e.type] || accentColor;
        return <article key={e.id} className={`card today-class${e.id===currentId?' now':''}${status==='cancelled'?' is-cancelled':''}${flashed===e.id?' card-flash':''}`} style={{'--accent':accentColor} as CSSProperties}>
          <div className="today-class-time"><b>{e.startTime}</b><small>{e.endTime}</small></div>
          <div className="today-class-info">
            <h3>{displayName}{e.id===currentId&&<span className="now-badge">Now</span>}{e.id===nextId&&<span className="next-badge">Next</span>}</h3>
            <p><i className="class-type-dot" style={{background:dotColor}} aria-hidden="true"/><span className="type-badge" style={{'--type-color':dotColor} as CSSProperties}>{e.type}</span> · {e.room||'Room TBA'}{status&&status!=='unmarked'&&<> · <b className={`status-tag-${status}`}>{status[0].toUpperCase()+status.slice(1)}</b></>}</p>
            {isOrphan&&<p className="field-error" style={{marginTop:4,fontSize:12}}>Unlinked class — link to a subject</p>}
          </div>
          <div className="today-class-actions">
            <button aria-label={`Mark ${displayName} present`} disabled={isOrphan} className={`tc-btn present${status==='present'?' picked':''}`} onClick={()=>hit(e,'present')}><Check/></button>
            <button aria-label={`Mark ${displayName} absent`} disabled={isOrphan} className={`tc-btn absent${status==='absent'?' picked':''}`} onClick={()=>hit(e,'absent')}>−</button>
            <button aria-label={`Mark ${displayName} cancelled`} disabled={isOrphan} className={`tc-btn cancelled${status==='cancelled'?' picked':''}`} onClick={()=>hit(e,'cancelled')}>Cancelled</button>
          </div>
        </article>;
      })}
    </div>}
  </section>;
}

// Placeholders for the gap between "signed in" and "the cloud pull landed". They mirror the real
// layouts closely enough that nothing jumps when the data arrives, and they are decorative, so
// they are hidden from assistive tech and the surrounding copy carries the status instead.
function Skel({w,h=12}:{w:string,h?:number}){return <i className="skel" style={{width:w,height:h} as CSSProperties}/>}
function SkeletonToday(){
  return <div className="today-list" aria-hidden="true">
    {[0,1,2].map(i=><article key={i} className="card today-class skel-class">
      <div className="today-class-time"><Skel w="34px" h={14}/><Skel w="28px" h={10}/></div>
      <div className="today-class-info"><Skel w="46%" h={14}/><Skel w="32%" h={10}/></div>
      <div className="today-class-actions"><Skel w="38px" h={38}/><Skel w="38px" h={38}/><Skel w="74px" h={38}/></div>
    </article>)}
  </div>
}
function SkeletonSubjects(){
  return <section className="subject-grid" aria-hidden="true">
    {[0,1,2].map(i=><article key={i} className="card subject skel-subject">
      <Skel w="38px" h={38}/><Skel w="62%" h={15}/><Skel w="44%" h={11}/><Skel w="30%" h={22}/><Skel w="100%" h={8}/>
    </article>)}
  </section>
}
function DayAttendance({subjects,records,table,day,onMark}:{subjects:Subject[];records:Attendance[];table:TimetableEntry[];day:string;onMark:(id:string,s:AttendanceStatus,date?:string,sessionId?:string)=>void}){
  const dayName=DAYS[(new Date(day+'T12:00').getDay()+6)%7];
  const scheduled=table.filter(t=>t.day===dayName).sort((a,b)=>a.startTime.localeCompare(b.startTime));
  const otherSubjects=subjects.filter(s=>!scheduled.some(e=>e.subjectId===s.id));
  if(!subjects.length)return <Empty title="No subjects yet" text="Add subjects from Home to start marking attendance."/>;
  return <div className="attendance-list">
    {scheduled.map(e=>{
      const subject=subjects.find(s=>s.id===e.subjectId);
      const record=records.find(r=>r.subjectId===e.subjectId&&r.date===day&&r.sessionId===e.id) ?? records.find(r=>r.subjectId===e.subjectId&&r.date===day&&(r.sessionId==='manual'||!table.some(t=>t.id===r.sessionId)));
      const status=record?.status;
      const displayName=subject?.name||e.subject;
      const isOrphan=!subject;
      return <article className={`card attendance-row${status==='cancelled'?' is-cancelled':''}`} key={e.id}>
        <span className="subject-icon" style={{background:subject?.color||colors[0]}}>{(subject?.code||displayName).slice(0,2)}</span>
        <div>
          <h3>{displayName}</h3>
          <small>{e.startTime}–{e.endTime} · <span className="type-badge" style={{'--type-color':TYPE_COLOR[e.type]||'var(--brand)'} as CSSProperties}>{e.type}</span>{e.room?` · ${e.room}`:''} · {status&&status!=='unmarked'?`Marked ${status}`:'Not marked'}</small>
          {isOrphan&&<p className="field-error" style={{marginTop:4,fontSize:12}}>Unlinked class — link to a subject</p>}
        </div>
        <div className="three">
          <button disabled={isOrphan} className={status==='present'?'picked present':''} onClick={()=>onMark(e.subjectId,'present',day,e.id)}>Present</button>
          <button disabled={isOrphan} className={status==='absent'?'picked absent':''} onClick={()=>onMark(e.subjectId,'absent',day,e.id)}>Absent</button>
          <button disabled={isOrphan} className={status==='cancelled'?'picked cancelled':''} onClick={()=>onMark(e.subjectId,'cancelled',day,e.id)}>Cancelled</button>
          <button disabled={isOrphan} className={status==='unmarked'?'picked':''} onClick={()=>onMark(e.subjectId,'unmarked',day,e.id)}>Clear</button>
        </div>
      </article>;
    })}
    {scheduled.length>0&&otherSubjects.length>0&&<div className="section-title" style={{marginTop:16,marginBottom:4}}><div><h3 style={{fontSize:14,color:'var(--muted)',fontWeight:600,textTransform:'uppercase'}}>Extra Classes</h3></div></div>}
    {(scheduled.length===0?subjects:otherSubjects).map(s=>{
      const record=records.find(r=>r.subjectId===s.id&&r.date===day);
      const status=record?.status;
      const targetSessionId=record?.sessionId??'manual';
      return <article className={`card attendance-row${status==='cancelled'?' is-cancelled':''}`} key={s.id}>
        <span className="subject-icon" style={{background:s.color}}>{s.code.slice(0,2)||'•'}</span>
        <div>
          <h3>{s.name}</h3>
          <small>{status&&status!=='unmarked'?`Marked ${status}`:'Not marked'}</small>
        </div>
        <div className="three">
          <button className={status==='present'?'picked present':''} onClick={()=>onMark(s.id,'present',day,targetSessionId)}>Present</button>
          <button className={status==='absent'?'picked absent':''} onClick={()=>onMark(s.id,'absent',day,targetSessionId)}>Absent</button>
          <button className={status==='cancelled'?'picked cancelled':''} onClick={()=>onMark(s.id,'cancelled',day,targetSessionId)}>Cancelled</button>
          <button className={status==='unmarked'?'picked':''} onClick={()=>onMark(s.id,'unmarked',day,targetSessionId)}>Clear</button>
        </div>
      </article>;
    })}
  </div>;
}

function CalendarPage({subjects,records,table,onMark,onImport,onOpenMonthly}:{subjects:Subject[];records:Attendance[];table:TimetableEntry[];onMark:(id:string,s:AttendanceStatus,date?:string,sessionId?:string)=>void;onImport?:()=>void;onOpenMonthly?:()=>void}){
  const { todayISO } = useToday();
  const [cursor,setCursor]=useState(()=>new Date()),[selected,setSelected]=useState(todayISO);
  const y=cursor.getFullYear(),m=cursor.getMonth(),first=new Date(y,m,1),count=new Date(y,m+1,0).getDate(),offset=(first.getDay()+6)%7;
  const dates=Array.from({length:offset+count},(_,i)=>i<offset?'':`${y}-${String(m+1).padStart(2,'0')}-${String(i-offset+1).padStart(2,'0')}`);
  const validSubIds=new Set(subjects.map(s=>s.id));
  const validRecords=records.filter(r=>validSubIds.has(r.subjectId));
  const daily=validRecords.filter(r=>r.date===selected&&r.status!=='unmarked');
  return <>
    <div className="calendar-head">
      <button className="icon" onClick={()=>setCursor(new Date(y,m-1,1))} aria-label="Previous month"><ChevronLeft/></button>
      <h2>{cursor.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</h2>
      <button className="icon" onClick={()=>setCursor(new Date(y,m+1,1))} aria-label="Next month"><ChevronRight/></button>
    </div>
    <div className="week">
      {['M','T','W','T','F','S','S'].map((x,i)=><b key={i}>{x}</b>)}
      {dates.map((d,i)=>d?<button key={d} onClick={()=>setSelected(d)} className={`date ${selected===d?'selected':''}`}><span>{i-offset+1}</span><i className={validRecords.some(r=>r.date===d&&r.status==='absent')?'has-absent':validRecords.some(r=>r.date===d&&r.status==='present')?'has-present':''}/></button>:<span key={i}/>)}
    </div>
    <section className="section-title">
      <div>
        <h2>{new Date(selected+'T12:00').toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})}</h2>
        <p>{daily.filter(x=>x.status==='present').length} present · {daily.filter(x=>x.status==='absent').length} absent</p>
      </div>
      <div style={{display:'flex',gap:12,alignItems:'center'}}>
        {onOpenMonthly&&<button className="text" onClick={onOpenMonthly} style={{display:'inline-flex',alignItems:'center',gap:5,fontWeight:600}}><CalendarDays size={16}/> Monthly View</button>}
        {onImport&&<button className="text" onClick={onImport} style={{display:'inline-flex',alignItems:'center',gap:6}}><Sparkles size={16}/> Import AI</button>}
      </div>
    </section>
    <DayAttendance subjects={subjects} records={records} table={table} day={selected} onMark={onMark}/>
  </>;
}
const blankEntry=(uid:string):TimetableEntry=>({id:id(),uid,day:'Monday',subjectId:'',subject:'',startTime:'09:00',endTime:'10:00',room:'',teacher:'',type:'Lecture',notes:'',order:0});
export function TimetablePage({subjects,table,onEdit,onDelete,onImport}:{subjects:Subject[],table:TimetableEntry[],onEdit:(e:TimetableEntry)=>void,onDelete:(e:TimetableEntry)=>void,onImport:()=>void}){const { todayDay: currentTodayDay } = useToday();const [day,setDay]=useState(currentTodayDay);const entries=table.filter(t=>t.day===day).sort((a,b)=>a.startTime.localeCompare(b.startTime));return <><div className="toolbar"><div className="view-segmented-control" role="tablist">{DAYS.map(d=><button type="button" role="tab" key={d} className={`view-tab-btn ${d===day?'active':''}`} onClick={()=>setDay(d)}><span>{d.slice(0,3)}</span></button>)}</div></div><div className="import-banner"><Sparkles/><div><b>Update Timetable with AI</b><span>Upload a PDF or image to replace your recurring timetable.</span></div><button onClick={onImport}>Update Timetable</button></div>{!entries.length?<Empty title={`No classes on ${day}`} text="Update your timetable to see scheduled classes." action="Update Timetable" onAction={onImport}/>:<div className="timeline">{entries.map(e=><article className="card entry" key={e.id}><time>{e.startTime}<small>{e.endTime}</small></time>{(()=>{const sub=subjects.find(s=>s.id===e.subjectId);const displayName=sub?.name||e.subject;return <div><h3>{displayName}</h3><p><span className="type-badge" style={{'--type-color':TYPE_COLOR[e.type]||'var(--brand)'} as CSSProperties}>{e.type}</span> · {e.room||'Room TBA'} {e.teacher&&`· ${e.teacher}`}</p><small>{e.notes}</small></div>})()}<button className="icon" onClick={()=>onEdit(e)} aria-label="Edit class">•••</button><button className="icon danger-text" onClick={()=>onDelete(e)} aria-label="Delete class"><Trash2/></button></article>)}</div>}</>}
function Statistics({subjects,records,table,stats,restoring,onExportExcel}:{subjects:Subject[],records:Attendance[],table:TimetableEntry[],stats:ReturnType<typeof overall>,restoring:boolean,onExportExcel:()=>void}){
  const [tab, setTab] = useState<'overview' | 'monthly'>('overview');
  const chart=subjects.map(s=>({id:s.id,name:s.code||s.name.slice(0,8),value:+subjectStats(s,records).pct.toFixed(0),fill:s.color}));
  const validSubIds=useMemo(()=>new Set(subjects.map(s=>s.id)),[subjects]);
  const validRecords=useMemo(()=>records.filter(r=>validSubIds.has(r.subjectId)),[records,validSubIds]);
  const line=useMemo(()=>trend(validRecords),[validRecords]);
  const ranked=useMemo(()=>subjects.map(s=>({subject:s,x:subjectStats(s,records)})).sort((a,b)=>b.x.pct-a.x.pct),[subjects,records]);
  const held=ranked.filter(r=>r.x.total>0),best=held[0],lowest=held.length>1?held[held.length-1]:undefined;

  return <>
    <div className="reports-top-bar">
      <div className="view-segmented-control" role="tablist" aria-label="Reports View">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'overview'}
          className={`view-tab-btn ${tab === 'overview' ? 'active' : ''}`}
          onClick={() => setTab('overview')}
        >
          <BarChart3 size={15} />
          <span>Overview Reports</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'monthly'}
          className={`view-tab-btn ${tab === 'monthly' ? 'active' : ''}`}
          onClick={() => setTab('monthly')}
        >
          <CalendarDays size={15} />
          <span>Monthly Attendance</span>
        </button>
      </div>

      <button
        type="button"
        className="primary btn-export-excel"
        onClick={onExportExcel}
        aria-label="Export attendance to Excel"
      >
        <FileSpreadsheet size={16} />
        <span>Export Excel</span>
      </button>
    </div>

    {tab === 'monthly' ? (
      <MonthlyAttendance
        subjects={subjects}
        records={records}
        table={table}
        onExportExcel={onExportExcel}
      />
    ) : (
      <>
        {restoring&&!subjects.length?<SkeletonStats/>:(
          <>
            <section className="stat-cards">
              <article className="card"><p>Classes attended</p><h2>{stats.present}</h2></article>
              <article className="card"><p>Classes missed</p><h2>{stats.absent}</h2></article>
              <article className="card"><p>Overall</p><h2>{stats.pct.toFixed(1)}%</h2></article>
            </section>
            <section className="chart card">
              <h2>Subject attendance</h2>
              {chart.length?<ResponsiveContainer width="100%" height={270}><BarChart data={chart}><XAxis dataKey="name"/><Tooltip/><Bar dataKey="value" radius={[8,8,0,0]}>{chart.map(x=><Cell key={x.id} fill={x.fill}/>)}</Bar></BarChart></ResponsiveContainer>:<p>Add attendance to unlock your statistics.</p>}
            </section>
            <section className="chart card">
              <h2>Overall over time</h2>
              {line.length>1?<ResponsiveContainer width="100%" height={230}><AreaChart data={line} margin={{top:6,right:6,left:-22,bottom:0}}>
                <defs><linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--brand)" stopOpacity=".38"/><stop offset="100%" stopColor="var(--brand)" stopOpacity="0"/></linearGradient></defs>
                <CartesianGrid vertical={false} stroke="var(--line)"/>
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={18}/>
                <YAxis domain={[0,100]} ticks={[0,25,50,75,100]} tickLine={false} axisLine={false} width={44} unit="%"/>
                <Tooltip formatter={(v:number)=>[`${v}%`,'Overall']}/>
                <Area type="monotone" dataKey="pct" stroke="var(--brand)" strokeWidth={2.5} fill="url(#trend-fill)"/>
              </AreaChart></ResponsiveContainer>:<p>Mark classes on two or more days and your trend will appear here.</p>}
            </section>
            {ranked.length>0&&<section className="ring-grid">{ranked.map(({subject,x})=><article key={subject.id} className="card ring-card" style={{'--accent':subject.color} as CSSProperties}>
              <div className="ring-mini" style={{'--p':`${Math.min(x.pct,100)}%`} as CSSProperties}><b>{x.pct.toFixed(0)}%</b></div>
              <div><h3>{subject.name}</h3><p>{x.present} of {x.total} held · target {subject.target}%</p><small className={x.state}>{x.total===0?'No classes yet':x.state!=='risk'?`Safe to miss ${x.bunk}`:x.required===-1?'Target unreachable':`Attend next ${x.required}`}</small></div>
            </article>)}</section>}
            <section className="grid two">
              <article className="card standout best"><h3>Best subject</h3><b>{best?.subject.name||'—'}</b><p>{best?`${best.x.pct.toFixed(0)}% · ${best.x.present} of ${best.x.total}`:'No data yet'}</p></article>
              <article className="card standout risk"><h3>Needs attention</h3><b>{lowest?.subject.name||'—'}</b><p>{lowest?`${lowest.x.pct.toFixed(0)}% · ${lowest.x.present} of ${lowest.x.total}`:'No data yet'}</p></article>
            </section>
          </>
        )}
      </>
    )}
  </>;
}
function SkeletonStats(){
  return <div aria-hidden="true">
    <section className="stat-cards">{[0,1,2].map(i=><article key={i} className="card skel-stat"><Skel w="52%" h={11}/><Skel w="38%" h={26}/></article>)}</section>
    {['Subject attendance','Overall over time'].map(t=><section key={t} className="chart card"><Skel w="34%" h={16}/><Skel w="100%" h={210}/></section>)}
    <section className="ring-grid">{[0,1,2].map(i=><article key={i} className="card ring-card"><Skel w="64px" h={64}/><div className="skel-ring-text"><Skel w="58%" h={14}/><Skel w="40%" h={10}/></div></article>)}</section>
  </div>
}
export function SettingsPage({
  user,
  settings,
  subjects,
  records,
  table,
  syncStatus,
  storageMode,
  onSwitchToCloud,
  onSwitchToLocal,
  onOpenSignIn,
  onBackToStorageOptions,
  onSettings,
  onBackup,
  onRestore,
  onImportAttendance,
  onClear,
  onLogout
}:{
  user: AuthUser;
  settings: Settings;
  subjects: Subject[];
  records: Attendance[];
  table: TimetableEntry[];
  syncStatus: SyncStatus;
  storageMode?: StorageMode | null;
  onSwitchToCloud?: () => void;
  onSwitchToLocal?: () => void;
  onOpenSignIn?: () => void;
  onBackToStorageOptions?: () => void;
  onSettings: (s: Settings) => void;
  onBackup: () => void;
  onRestore: () => void;
  onImportAttendance: () => void;
  onClear: () => void;
  onLogout: () => void;
}){
  const [targetDraft, setTargetDraft] = useState(() => String(settings.defaultTarget));
  const [geminiKeyDraft, setGeminiKeyDraft] = useState(() => getGeminiApiKey());

  useEffect(() => {
    setTargetDraft(String(settings.defaultTarget));
  }, [settings.defaultTarget]);

  const commitTarget = () => {
    const parsed = parseInt(targetDraft, 10);
    const clamped = isNaN(parsed) ? 75 : Math.max(1, Math.min(100, parsed));
    setTargetDraft(String(clamped));
    if (clamped !== settings.defaultTarget) {
      onSettings({ ...settings, defaultTarget: clamped });
    }
  };

  return <div className="settings">
    {storageMode === 'cloud' ? (
      <section className="card account">
        <UserAvatar user={user} alt={user.displayName || 'Profile'} showFallback/>
        <div><h2>{user.displayName}</h2><p>{user.email}</p><SyncBadge status={syncStatus} mode="cloud"/></div>
        <button onClick={onLogout}><LogOut/> Logout</button>
      </section>
    ) : (
      <section className="card account">
        <div>
          <h2>Local Mode</h2>
          <p>Not signed in · Data stays on this device</p>
          <SyncBadge status={syncStatus} mode="local"/>
        </div>
        <button className="primary" onClick={onOpenSignIn ?? onSwitchToCloud} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Cloud size={16}/> Sign in with Google
        </button>
      </section>
    )}
    <section className="card">
      <h2>Data & sync</h2>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <b style={{ fontSize: 15 }}>Storage Mode: {storageMode === 'local' ? 'Local only' : 'Google Cloud Sync'}</b>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
            {storageMode === 'local'
              ? 'Data lives solely on this device. Sign in with Google anytime to back up and sync.'
              : `Connected as ${user.email || user.displayName || 'Google Account'}`}
          </p>
        </div>
        <SyncBadge status={syncStatus} mode={storageMode} />
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
        {storageMode === 'local' ? (
          <>
            <button className="primary" onClick={onSwitchToCloud} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Cloud size={16} /> Turn on Cloud Sync
            </button>
            {onBackToStorageOptions && (
              <button onClick={onBackToStorageOptions} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                ← Change storage mode
              </button>
            )}
          </>
        ) : (
          <button onClick={onSwitchToLocal} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <HardDrive size={16} /> Switch to Local Mode
          </button>
        )}
      </div>
    </section>
    <section className="card">
      <h2>Attendance</h2>
      <label>Default target percentage
        <input
          type="number"
          min="1"
          max="100"
          value={targetDraft}
          onChange={e=>setTargetDraft(e.target.value)}
          onBlur={commitTarget}
        />
      </label>
      <p className="muted">New subjects start with this target. Existing subjects keep their own target.</p>
    </section>
    <section className="card">
      <h2>Appearance</h2>
      <div className="themes">{(['system','light','dark','amoled'] as const).map(t=><button key={t} className={settings.theme===t?'picked':''} onClick={()=>onSettings({...settings,theme:t})}>{t==='amoled'?<Moon/>:null}{t}</button>)}</div>
    </section>
    <section className="card">
      <h2>AI Configuration</h2>
      <label>Gemini API Key
        <input
          type="password"
          placeholder="Enter Gemini API key"
          value={geminiKeyDraft}
          onChange={e => {
            setGeminiKeyDraft(e.target.value);
            setGeminiApiKey(e.target.value);
          }}
        />
      </label>
      <p className="muted">Stored locally on this device only. Used for AI Timetable and Attendance imports.</p>
    </section>
    <section className="card">
      <h2>Your data</h2>
      <p className="muted">Your attendance lives in IndexedDB on this device first, and is mirrored to a private Firestore record under your account so it follows you across devices. Only the file you pick for an AI import — a timetable, or a .txt attendance export — is sent to Gemini, and nothing is written until you confirm the review.</p>
      <div className="data-actions">
        <button onClick={onBackup}><Download/> Backup data</button>
        <button onClick={onRestore}><Upload/> Restore backup</button>
        <button onClick={onImportAttendance}><Sparkles/> Import attendance</button>
        <button className="danger-text" onClick={onClear}><Trash2/> Remove all data</button>
      </div>
    </section>
    <section className="card about">
      <h2>Self Attendance <small>v1.0.0</small></h2>
      <p>{subjects.length} subjects · {records.length} attendance records · {table.length} timetable sessions</p>
      <p className="muted">Local-first by design: every screen reads and writes IndexedDB directly, so the app stays fast and fully usable offline. Sign in to additionally back up and sync that data to your own Firestore record.</p>
    </section>
  </div>;
}
// The error text only appears once the form has been submitted, so a fresh empty form is quiet.
// Two things make that reachable: `noValidate`, because the native bubbles swallow the submit
// event before React sees it, and an always-enabled save button, because a disabled one can never
// tell you why. `required` stays on the inputs — assistive tech still reads them as required.
function SubjectForm({subject,onSave,onDelete,onClose}:{subject:Subject,onSave:(s:Subject)=>void,onDelete?: (s:Subject,history:boolean)=>void,onClose:()=>void}){const [s,setS]=useState(subject),[tried,setTried]=useState(false);const nameBad=!s.name.trim(),targetBad=!(s.target>0&&s.target<=100),valid=!nameBad&&!targetBad;return <Modal onClose={onClose}><h2>{subject.name?'Edit subject':'New subject'}</h2><form noValidate onSubmit={e=>{e.preventDefault();setTried(true);if(valid)onSave(s)}}><label>Subject name<input required className={tried&&nameBad?'invalid':''} aria-invalid={tried&&nameBad} value={s.name} onChange={e=>setS({...s,name:e.target.value})} placeholder="e.g. Data Structures"/>{tried&&nameBad&&<em className="field-error">Subject name is required</em>}</label><div className="form-grid"><label>Short code<input value={s.code} onChange={e=>setS({...s,code:e.target.value})} placeholder="CS201"/></label><label>Target %<input required type="number" min="1" max="100" className={tried&&targetBad?'invalid':''} aria-invalid={tried&&targetBad} value={s.target} onChange={e=>setS({...s,target:+e.target.value})}/>{tried&&targetBad&&<em className="field-error">Target must be 1–100</em>}</label></div><label>Teacher<input value={s.teacher} onChange={e=>setS({...s,teacher:e.target.value})}/></label><label>Room<input value={s.room} onChange={e=>setS({...s,room:e.target.value})}/></label><label>Color<input type="color" value={s.color} onChange={e=>setS({...s,color:e.target.value})}/></label><button className="primary full">Save subject</button></form>{onDelete&&<div className="delete-subject"><button className="danger" onClick={()=>onDelete(s,false)}>Delete subject, keep history</button><button className="danger-text" onClick={()=>onDelete(s,true)}>Delete subject & history</button></div>}</Modal>}
function EntryForm({entry,subjects,onSave,onClose}:{entry:TimetableEntry,subjects:Subject[],onSave:(e:TimetableEntry,newSubject?:Subject)=>void,onClose:()=>void}){
  const [e,setE]=useState(entry),[tried,setTried]=useState(false);
  const HH_MM_REGEX=/^([01]\d|2[0-3]):[0-5]\d$/;
  const startBad=!e.startTime||!HH_MM_REGEX.test(e.startTime);
  const endBad=!e.endTime||!HH_MM_REGEX.test(e.endTime);
  const timeBad=startBad||endBad||e.startTime>=e.endTime;
  const subjectBad=!e.subject.trim();
  const valid=!subjectBad&&!timeBad;
  const choose=(v:string)=>{
    const s=subjects.find(x=>x.id===v);
    setE({...e,subjectId:v,subject:s?.name??e.subject,teacher:s?.teacher??e.teacher,room:s?.room??e.room});
  };
  const handleSubmit=(x:React.FormEvent)=>{
    x.preventDefault();
    setTried(true);
    if(!valid)return;
    let finalEntry={...e};
    let newSubject:Subject|undefined;
    if(!finalEntry.subjectId||!subjects.some(s=>s.id===finalEntry.subjectId)){
      newSubject={
        id:id(),
        uid:e.uid,
        name:e.subject.trim(),
        code:'',
        teacher:e.teacher||'',
        room:e.room||'',
        color:colors[subjects.length%colors.length],
        target:75,
        createdAt:new Date().toISOString()
      };
      finalEntry.subjectId=newSubject.id;
    }
    onSave(finalEntry,newSubject);
  };
  return <Modal onClose={onClose}>
    <h2>{entry.subject?'Edit class':'New class'}</h2>
    <form noValidate onSubmit={handleSubmit}>
      <label>Day<select value={e.day} onChange={x=>setE({...e,day:x.target.value})}>{DAYS.map(d=><option key={d}>{d}</option>)}</select></label>
      <label>Subject
        <select value={e.subjectId} onChange={x=>choose(x.target.value)}>
          <option value="">+ New subject (or type below)</option>
          {subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <label>Subject name<input required className={tried&&subjectBad?'invalid':''} aria-invalid={tried&&subjectBad} value={e.subject} onChange={x=>setE({...e,subject:x.target.value})}/>{tried&&subjectBad&&<em className="field-error">Subject name is required</em>}</label>
      <div className="form-grid">
        <label>Start<input required type="time" className={tried&&startBad?'invalid':''} aria-invalid={tried&&startBad} value={e.startTime} onChange={x=>setE({...e,startTime:x.target.value})}/>{tried&&startBad&&<em className="field-error">Valid HH:MM required</em>}</label>
        <label>End<input required type="time" className={tried&&timeBad?'invalid':''} aria-invalid={tried&&timeBad} value={e.endTime} onChange={x=>setE({...e,endTime:x.target.value})}/>{tried&&!startBad&&timeBad&&<em className="field-error">End time must be after start time</em>}</label>
      </div>
      <div className="form-grid">
        <label>Room<input value={e.room} onChange={x=>setE({...e,room:x.target.value})}/></label>
        <label>Class type<select value={e.type} onChange={x=>setE({...e,type:x.target.value})}><option>Lecture</option><option>Lab</option><option>Tutorial</option><option>Seminar</option></select></label>
      </div>
      <label>Teacher<input value={e.teacher} onChange={x=>setE({...e,teacher:x.target.value})}/></label>
      <label>Notes<input value={e.notes} onChange={x=>setE({...e,notes:x.target.value})}/></label>
      <button className="primary full">Save class</button>
    </form>
  </Modal>;
}

function ImportModal({uid,subjects,table,defaultTarget,onSaved,onClose}:{uid:string,subjects:Subject[],table:TimetableEntry[],defaultTarget:number,onSaved:()=>void,onClose:()=>void}){
  const [file,setFile]=useState<File|null>(null);
  const [defaultRoom,setDefaultRoom]=useState('');
  const [items,setItems]=useState<DetectedEntry[]>([]);
  const [busy,setBusy]=useState(false);
  const [busyCommit,setBusyCommit]=useState(false);
  const [error,setError]=useState('');
  const [summary,setSummary]=useState<{imported:number,skipped:number}|null>(null);
  const reqIdRef = useRef(0);

  const choose=async(f?:File)=>{
    if(!f)return;
    const currentReq = ++reqIdRef.current;
    setFile(f);
    setBusy(true);
    setError('');
    setSummary(null);
    try{
      const res = await extractTimetable(f);
      if(reqIdRef.current === currentReq){
        setItems(res.map(x => ({ ...x, room: x.room || defaultRoom })));
      }
    }catch(e){
      if(reqIdRef.current === currentReq){
        setError(e instanceof Error?e.message:'Unable to import this timetable.');
      }
    }finally{
      if(reqIdRef.current === currentReq){
        setBusy(false);
      }
    }
  };

  const edit=(i:number,k:string,v:string)=>setItems(items.map((x,n)=>n===i?{...x,[k]:v}:x));

  const commit=async()=>{
    if(busyCommit)return;
    setBusyCommit(true);
    setError('');
    try{
      const norm=(v:string)=>v.trim().toLowerCase();
      const known=new Map<string,Subject>();
      subjects.forEach(s=>known.set(norm(s.name),s));
      const saves:Subject[]=[],entries:TimetableEntry[]=[],seen=new Set<string>();
      // importTimetableData replaces the whole timetable, so matching rows are kept (reusing the old id so
      // attendance already linked to that session stays linked) rather than skipped and then deleted.
      const existingIds=new Map(table.map(t=>[`${t.subjectId}|${t.day}|${t.startTime}|${t.endTime}|${t.room}`,t.id]));
      let created=0;
      let skipped=0;
      for(const x of items){
        if(!x.day||!x.subject?.trim()||!x.startTime||!x.endTime||x.startTime>=x.endTime){
          skipped++;
          continue;
        }
        const day=DAYS.find(d=>d.toLowerCase()===x.day!.toLowerCase());
        if(!day){
          skipped++;
          continue;
        }
        const name=x.subject.trim(),room=x.room??'',teacher=x.teacher??'';
        let s=known.get(norm(name));
        if(!s){
          s={id:id(),uid,name,code:x.subjectCode?.trim()||'',teacher,room,target:defaultTarget,color:colors[(subjects.length+created)%colors.length],createdAt:new Date().toISOString()};
          known.set(norm(name),s);
          saves.push(s);
          created++;
        }else{
          const upd={...s,code:s.code||x.subjectCode?.trim()||'',teacher:s.teacher||teacher,room:s.room||room};
          if(upd.code!==s.code||upd.teacher!==s.teacher||upd.room!==s.room){
            known.set(norm(name),upd);
            saves.push(upd);
          }
        }
        const key=`${s.id}|${day}|${x.startTime}|${x.endTime}|${room}`;
        if(seen.has(key)){
          skipped++;
          continue;
        }
        seen.add(key);
        entries.push({...blankEntry(uid),id:existingIds.get(key)??id(),uid,day,subjectId:s.id,subject:name,startTime:x.startTime,endTime:x.endTime,room,teacher,type:x.type||'Lecture',notes:x.notes??'',order:0});
      }
      await importTimetableData(uid,saves,entries);
      setSummary({imported:entries.length,skipped});
      onSaved();
    }catch(e){
      setError(e instanceof Error?e.message:'Import failed. Please try again.');
    }finally{
      setBusyCommit(false);
    }
  };

  return <Modal onClose={onClose}>
    <h2><Sparkles/> Import timetable with AI</h2>
    <p className="muted">Only this selected timetable file is sent to Gemini. Review before anything is saved.</p>
    {summary ? (
      <>
        <div className="success"><Check/> Import complete: {summary.imported} of {items.length} imported, {summary.skipped} skipped.</div>
        <button className="primary full" onClick={onClose}>Done</button>
      </>
    ) : (
      <>
        <div style={{marginBottom: 16}}>
          <label>Default Classroom (Optional)
            <input type="text" placeholder="e.g. 215" value={defaultRoom} onChange={e=>setDefaultRoom(e.target.value)}/>
          </label>
        </div>
        <label className="drop"><CloudUpload/><b>{file?file.name:'Upload timetable'}</b><span>PDF, PNG, JPG, JPEG or WEBP · max 15 MB</span><input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={e=>choose(e.target.files?.[0])}/></label>
        {busy&&<div className="processing"><ThinkingOrb state="searching" size={20} aria-label="Working"/> Reading your timetable…</div>}
        {error&&<div className="error">{error}</div>}
        {items.length>0&&<>
          <div className="success"><Check/> AI detected {items.length} timetable entries. Edit anything uncertain.</div>
          <div className="review">
            {items.map((x,i)=>{
              const invalid=!x.day||!DAYS.includes(x.day)||!x.startTime||!x.endTime||x.startTime>=x.endTime;
              return <div key={i} className={`review-row${invalid?' has-warning':''}`} style={invalid?{border:'1px solid var(--absent,#ff5c5c)',borderRadius:8,padding:4}:undefined}>
                <select value={x.day||'Monday'} onChange={e=>edit(i,'day',e.target.value)}>{DAYS.map(d=><option key={d}>{d}</option>)}</select>
                <input value={x.subject||''} onChange={e=>edit(i,'subject',e.target.value)} placeholder="Subject"/>
                <input type="time" value={x.startTime||''} onChange={e=>edit(i,'startTime',e.target.value)}/>
                <input type="time" value={x.endTime||''} onChange={e=>edit(i,'endTime',e.target.value)}/>
                <input value={x.room||''} onChange={e=>edit(i,'room',e.target.value)} placeholder="Room"/>
                <button className="icon danger-text" onClick={()=>setItems(items.filter((_,n)=>n!==i))} aria-label="Delete class"><Trash2/></button>
              </div>;
            })}
          </div>
          <button className="primary full" disabled={busyCommit} onClick={commit}>
            {busyCommit ? 'Importing…' : `Import ${items.length} timetable entries`}
          </button>
        </>}
      </>
    )}
  </Modal>;
}

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
function AttendanceImportModal({uid,subjects,records,defaultTarget,onCommitted,onDone,onClose}:{uid:string,subjects:Subject[],records:Attendance[],defaultTarget:number,onCommitted?:()=>Promise<void>,onDone:(n:number)=>void,onClose:()=>void}){
  const [stage,setStage]=useState<'upload'|'analyzing'|'review'|'importing'|'done'>('upload');
  const [file,setFile]=useState<File|null>(null),[error,setError]=useState(''),[warnings,setWarnings]=useState<string[]>([]),[truncated,setTruncated]=useState(false);
  const [groups,setGroups]=useState<SubjectGroup[]>([]),[overwrite,setOverwrite]=useState(false),[allowMultipleSameDay,setAllowMultipleSameDay]=useState(false),[includeUnreviewed,setIncludeUnreviewed]=useState(false),[showAll,setShowAll]=useState(false),[saved,setSaved]=useState({subjects:0,records:0,present:0,absent:0});
  const view=useMemo(()=>annotate(groups,records,allowMultipleSameDay),[groups,records,allowMultipleSameDay]);
  const sum=useMemo(()=>summarise(view,overwrite),[view,overwrite]);
  const read=async(f?:File)=>{
    if(!f)return; setFile(f); setError(''); setStage('analyzing');
    try{ const parsed=await extractAttendance(f); setWarnings(parsed.warnings); setTruncated(parsed.truncated); setGroups(analyse(parsed,subjects)); setShowAll(false); setIncludeUnreviewed(false); setStage('review') }
    catch(e){ setError(e instanceof Error?e.message:'We could not read that file. Please try again.'); setStage('upload') }
  };
  const setGroup=(key:string,patch:Partial<SubjectGroup>)=>setGroups(gs=>gs.map(g=>g.key===key?{...g,...patch}:g));
  const setRow=(gk:string,rk:string,patch:Partial<ReviewRow>)=>setGroups(gs=>gs.map(g=>g.key===gk?{...g,rows:g.rows.map(r=>r.key===rk?{...r,...patch}:r)}:g));
  const commit=async()=>{
    setError(''); setStage('importing');
    try{
      let groupsToCommit = view;
      if (!showAll && !includeUnreviewed && sum.total > ROW_CAP) {
        let remaining = ROW_CAP;
        groupsToCommit = view.map(g => {
          if (remaining <= 0) return { ...g, rows: [] };
          const slice = g.rows.slice(0, remaining);
          remaining -= g.rows.length;
          return { ...g, rows: slice };
        }).filter(g => g.rows.length > 0);
      }
      const w=buildWrites(groupsToCommit,{uid,defaultTarget,colors,subjects,existing:records,overwrite},allowMultipleSameDay);
      await importAttendanceData(w.subjects,w.records);
      setSaved({subjects:w.subjects.length,records:w.records.length,present:sum.present,absent:sum.absent});
      if(onCommitted)await onCommitted();
      setStage('done');
    }
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
      
      <div className="import-conflicts" style={{marginBottom:'1rem'}}>
        <b>Same-Day Classes</b>
        <label className="choice">
          <input type="checkbox" checked={allowMultipleSameDay} onChange={e=>setAllowMultipleSameDay(e.target.checked)}/>
          Treat repeated rows on one day as separate classes (e.g. multi-hour lectures or labs)
        </label>
      </div>

      {sum.conflicts>0&&<div className="import-conflicts">
        <b>{sum.conflicts} {sum.conflicts===1?'day already has':'days already have'} a different mark</b>
        <label className="choice"><input type="radio" checked={!overwrite} onChange={()=>setOverwrite(false)}/> Keep what I marked (skip those days)</label>
        <label className="choice"><input type="radio" checked={overwrite} onChange={()=>setOverwrite(true)}/> Replace them with the file</label>
      </div>}

      {sum.total > ROW_CAP && !showAll && (
        <div className="notice" style={{marginTop:'1rem',marginBottom:'1rem'}}>
          <b>Preview limit:</b> Showing the first {ROW_CAP} of {sum.total} records.
          <div style={{marginTop:'0.5rem'}}>
            <label className="choice">
              <input type="checkbox" checked={includeUnreviewed} onChange={e=>setIncludeUnreviewed(e.target.checked)}/>
              Include the {sum.total - ROW_CAP} unreviewed records beyond this preview in the import
            </label>
          </div>
        </div>
      )}

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
      <p className="muted">Your percentages on Calendar and Statistics already include these.</p>
      <button className="primary full" onClick={()=>onDone(saved.records)}>Done</button>
    </>}
  </Modal>;
}
export function BackupModal({data,onClose}:{data:BackupPayload,onClose:()=>void}){
  const download=async()=>{
    const content=makeBackup(data);
    const filename=`self-attendance-backup-${dateISO()}.txt`;
    await exportOrShareFile({
      filename,
      content,
      mimeType: 'text/plain',
    });
  };
  return <Modal onClose={onClose}>
    <h2>Backup your data</h2>
    <p>Your backup is readable text with a protected structured section for reliable restore. Store it somewhere safe.</p>
    <ul>
      <li>{data.subjects.length} subjects</li>
      <li>{data.attendance.length} attendance records</li>
      <li>{data.timetable.length} timetable sessions</li>
    </ul>
    <button className="primary full" onClick={download}><Download/> Download backup (.txt)</button>
  </Modal>;
}
function RestoreModal({uid,onDone,onClose}:{uid:string,onDone:()=>void,onClose:()=>void}){const [data,setData]=useState<BackupPayload|null>(null),[error,setError]=useState(''),[mode,setMode]=useState<'merge'|'replace'>('merge'),[withSettings,setWithSettings]=useState(false);const input=useRef<HTMLInputElement>(null);const choose=async(f?:File)=>{if(!f)return;try{setError('');setData(parseBackup(await f.text()))}catch(e){setData(null);setError(e instanceof Error?e.message:'Could not read that backup.')}};return <Modal onClose={onClose}><h2>Restore backup</h2><p>Nothing changes until you confirm.</p><input ref={input} type="file" accept="text/plain,.txt" onChange={e=>choose(e.target.files?.[0])}/>{error&&<div className="error">{error}</div>}{data&&<><div className="success"><Check/> Found {data.subjects.length} subjects, {data.attendance.length} attendance records, and {data.timetable.length} timetable entries.</div><label className="choice"><input type="radio" checked={mode==='merge'} onChange={()=>setMode('merge')}/> Merge with existing data</label><label className="choice"><input type="radio" checked={mode==='replace'} onChange={()=>setMode('replace')}/> Replace existing data</label><label className="choice"><input type="checkbox" checked={withSettings} onChange={e=>setWithSettings(e.target.checked)}/> Also restore theme and default target</label>{mode==='replace'&&<div className="notice">Replace deletes your current subjects, attendance and timetable first.</div>}<button className="primary full" onClick={async()=>{try{await restore(uid,data,mode==='replace',withSettings);onDone()}catch(e){setError(e instanceof Error?e.message:'Restore failed.')}}}>Confirm restore</button></>}</Modal>}
function Empty({title,text,action,onAction}:{title:string,text:string,action?:string,onAction?:()=>void}){return <section className="empty card"><BookOpen/><h2>{title}</h2><p>{text}</p>{action&&<button className="primary" onClick={onAction}>{action}</button>}</section>}
export default function App(){return <ErrorBoundary><AppContent/></ErrorBoundary>;}

import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { CheckCircle2, Info, X } from "lucide-react";
import Dialog from "../components/ui/Dialog";

interface Confirmation { title: string; description: string; confirmLabel?: string; danger?: boolean }
interface Notice { id: number; message: string; tone: "success" | "error" | "info" }
interface WorkspaceValue {
  confirm: (options: Confirmation) => Promise<boolean>;
  notify: (message: string, tone?: Notice["tone"]) => void;
  guardNavigation: (preserveChanges?: boolean) => Promise<boolean>;
  setDirty: (id: string, dirty: boolean) => void;
  setBusy: (id: string, busy: boolean) => void;
}
const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const resolveRef = useRef<((accepted: boolean) => void) | null>(null);
  const dirtyRef = useRef(new Set<string>());
  const busyRef = useRef(new Set<string>());
  const nextNotice = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const [notices, setNotices] = useState<Notice[]>([]);
  const setDirty = useCallback((id: string, dirty: boolean) => {
    if (dirty) dirtyRef.current.add(id); else dirtyRef.current.delete(id);
  }, []);
  const setBusy = useCallback((id: string, busy: boolean) => { if (busy) busyRef.current.add(id); else busyRef.current.delete(id); }, []);
  const confirm = useCallback((options: Confirmation) => {
    // A second click cannot replace a pending destructive decision.
    if (resolveRef.current) return Promise.resolve(false);
    setConfirmation(options);
    return new Promise<boolean>(resolve => { resolveRef.current = resolve; });
  }, []);
  const settle = useCallback((accepted: boolean) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setConfirmation(null);
    resolve?.(accepted);
  }, []);
  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setNotices(current => current.filter(notice => notice.id !== id));
  }, []);
  const notify = useCallback((message: string, tone: Notice["tone"] = "success") => {
    const id = ++nextNotice.current;
    setNotices(current => [...current.slice(-2), { id, message, tone }]);
    if (tone !== "error") timers.current.set(id, setTimeout(() => dismiss(id), 6500));
  }, [dismiss]);
  const guardNavigation = useCallback(async (preserveChanges = false) => {
    if (busyRef.current.size) { notify("Espera a que termine de guardarse la operación.", "info"); return false; }
    if (preserveChanges || dirtyRef.current.size === 0) return true;
    const accepted = await confirm({ title: "¿Salir sin guardar?", description: "Hay cambios pendientes en este formulario. Si sales, tendrás que capturarlos de nuevo.", confirmLabel: "Descartar y salir", danger: true });
    if (accepted) dirtyRef.current.clear();
    return accepted;
  }, [confirm, notify]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current.size || busyRef.current.size) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      timers.current.forEach(clearTimeout);
      resolveRef.current?.(false);
      resolveRef.current = null;
    };
  }, []);
  return <WorkspaceContext.Provider value={{ confirm, notify, guardNavigation, setDirty, setBusy }}>
    {children}
    <Dialog open={Boolean(confirmation)} onClose={() => settle(false)} title={confirmation?.title || "Confirmar acción"} description={confirmation?.description}
      footer={<><button type="button" autoFocus className="btn-secondary" onClick={() => settle(false)}>Volver</button><button type="button" className={confirmation?.danger ? "btn-danger" : "btn-primary"} onClick={() => settle(true)}>{confirmation?.confirmLabel || "Confirmar"}</button></>} />
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {notices.map(notice => <div key={notice.id} className={`app-toast ${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
        {notice.tone === "success" ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <Info className="h-5 w-5 shrink-0" />}<p>{notice.message}</p><button type="button" onClick={() => dismiss(notice.id)} aria-label="Cerrar notificación"><X className="h-4 w-4" /></button>
      </div>)}
    </div>
  </WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("WorkspaceProvider es necesario.");
  return context;
}

export function useUnsavedChanges(dirty: boolean, busy = false) {
  const id = useId();
  const { setDirty, setBusy } = useWorkspace();
  useEffect(() => { setDirty(id, dirty); return () => setDirty(id, false); }, [dirty, id, setDirty]);
  useEffect(() => { setBusy(id, busy); return () => setBusy(id, false); }, [busy, id, setBusy]);
  return useCallback(() => { setDirty(id, false); setBusy(id, false); }, [id, setDirty, setBusy]);
}

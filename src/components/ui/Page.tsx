import React from "react";
import { Inbox, RotateCcw, X } from "lucide-react";

export function PageHeader({ eyebrow, title, description, actions }: {
  eyebrow?: string; title: string; description?: string; actions?: React.ReactNode;
}) {
  return <header className="page-header">
    <div className="min-w-0">
      {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
      {description && <p className="page-description">{description}</p>}
    </div>
    {actions && <div className="page-actions">{actions}</div>}
  </header>;
}

export function EmptyState({ title, description, action, icon: Icon = Inbox }: {
  title: string; description: string; action?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return <div className="empty-state">
    <span className="empty-state-icon"><Icon className="h-6 w-6" /></span>
    <h2>{title}</h2><p>{description}</p>{action && <div className="mt-4">{action}</div>}
  </div>;
}

export function FilterSummary({ count, noun = "resultados", partial = false, active, onClear }: {
  count: number; noun?: string; partial?: boolean; active: boolean; onClear: () => void;
}) {
  return <div className="filter-summary" role="status">
    <span><strong>{count.toLocaleString("es-MX")}</strong> {noun}{partial && <span className="ml-1">· Sobre registros cargados</span>}</span>
    {active && <button type="button" onClick={onClear} className="inline-flex items-center gap-1.5 hover:text-emerald-600"><X className="h-3.5 w-3.5" />Limpiar filtros</button>}
  </div>;
}

export function StatCard({ label, value, hint, tone = "neutral" }: {
  label: string; value: React.ReactNode; hint?: string; tone?: "neutral" | "positive" | "warning";
}) {
  return <div className="stat-card"><p>{label}</p><strong className={`stat-value ${tone}`}>{value}</strong>{hint && <small>{hint}</small>}</div>;
}

export function LoadingState({ label = "Cargando información…" }: { label?: string }) {
  return <div className="p-6 space-y-4" role="status" aria-label={label}>
    <span className="sr-only">{label}</span>
    {[0, 1, 2, 3].map(index => <div key={index} className="h-12 rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse" style={{ opacity: 1 - index * .18 }} />)}
  </div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div role="alert" className="error-state"><p>{message}</p>{onRetry && <button type="button" onClick={onRetry} className="inline-flex items-center gap-2 font-semibold"><RotateCcw className="h-4 w-4" />Reintentar</button>}</div>;
}

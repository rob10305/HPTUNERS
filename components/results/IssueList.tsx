'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, XCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { DiagnosticResult } from '@/types/tuneData'

const STATUS_CONFIG = {
  fail: {
    icon: XCircle,
    iconClass: 'text-red-400',
    badgeClass: 'bg-red-500/20 text-red-400 border-red-500/30',
    rowClass: 'border-red-500/20',
    label: 'FAIL',
  },
  warn: {
    icon: AlertTriangle,
    iconClass: 'text-yellow-400',
    badgeClass: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    rowClass: 'border-yellow-500/20',
    label: 'WARN',
  },
  pass: {
    icon: CheckCircle2,
    iconClass: 'text-green-400',
    badgeClass: 'bg-green-500/20 text-green-400 border-green-500/30',
    rowClass: 'border-green-500/30',
    label: 'PASS',
  },
  info: {
    icon: Info,
    iconClass: 'text-blue-400',
    badgeClass: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    rowClass: 'border-border',
    label: 'INFO',
  },
}

const SEVERITY_LABEL: Record<number, string> = {
  4: 'Critical',
  3: 'Medium',
  2: 'Low',
  1: 'Info',
}

interface IssueRowProps {
  diagnostic: DiagnosticResult
}

function IssueRow({ diagnostic: d }: IssueRowProps) {
  const [open, setOpen] = useState(d.status === 'fail')
  const cfg = STATUS_CONFIG[d.status]
  const Icon = cfg.icon

  return (
    <div
      className={cn('rounded-lg border overflow-hidden transition-colors', cfg.rowClass)}
    >
      <button
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-card/80 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon className={cn('w-4 h-4 flex-shrink-0', cfg.iconClass)} />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium truncate block">{d.check}</span>
          <span className="text-xs text-muted-foreground capitalize">{d.system}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {d.value != null && d.limit != null && (
            <span className="text-xs text-muted-foreground hidden sm:block">
              {d.value.toFixed(1)} / {d.limit}
            </span>
          )}
          <span
            className={cn(
              'text-xs font-medium px-1.5 py-0.5 rounded border',
              cfg.badgeClass
            )}
          >
            {cfg.label}
          </span>
          <Badge variant="outline" className="text-xs hidden sm:flex">
            {SEVERITY_LABEL[d.severity] ?? d.severity}
          </Badge>
          {open ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-border/50 bg-card/30">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Finding</p>
            <p className="text-sm leading-relaxed">{d.finding}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Recommendation</p>
            <p className="text-sm leading-relaxed text-primary/90">{d.recommendation}</p>
          </div>
          {d.tableRef && (
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">Table reference:</p>
              <Badge variant="outline" className="text-xs font-mono">
                {d.tableRef}
              </Badge>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface IssueListProps {
  diagnostics: DiagnosticResult[]
  showPassed?: boolean
}

export function IssueList({ diagnostics, showPassed = false }: IssueListProps) {
  const [filter, setFilter] = useState<'all' | 'fail' | 'warn' | 'pass'>('all')

  const visible = diagnostics.filter((d) => {
    if (!showPassed && d.status === 'pass' && filter === 'all') return false
    if (filter !== 'all' && d.status !== filter) return false
    return true
  })

  const counts = {
    fail: diagnostics.filter((d) => d.status === 'fail').length,
    warn: diagnostics.filter((d) => d.status === 'warn').length,
    pass: diagnostics.filter((d) => d.status === 'pass').length,
  }

  return (
    <div className="space-y-3">
      {/* Filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {(
          [
            { key: 'all', label: 'All issues' },
            { key: 'fail', label: `Fail (${counts.fail})` },
            { key: 'warn', label: `Warn (${counts.warn})` },
            { key: 'pass', label: `Pass (${counts.pass})` },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              'text-xs px-3 py-1 rounded-full border transition-colors',
              filter === key
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:border-primary/50'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No issues matching this filter.
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((d, i) => (
            <IssueRow key={`${d.system}-${d.check}-${i}`} diagnostic={d} />
          ))}
        </div>
      )}
    </div>
  )
}

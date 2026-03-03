'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DiagnosticResult } from '@/types/tuneData'

const SYSTEMS = ['fuelling', 'ignition', 'airflow', 'boost', 'thermal', 'sensors'] as const
type System = typeof SYSTEMS[number]

const SYSTEM_LABELS: Record<System, string> = {
  fuelling: 'Fuelling',
  ignition: 'Ignition',
  airflow: 'Airflow',
  boost: 'Boost',
  thermal: 'Thermal',
  sensors: 'Sensors',
}

interface SystemStatus {
  system: System
  fail: number
  warn: number
  pass: number
  info: number
}

function worstStatus(s: SystemStatus): 'fail' | 'warn' | 'pass' | 'info' {
  if (s.fail > 0) return 'fail'
  if (s.warn > 0) return 'warn'
  if (s.pass > 0) return 'pass'
  return 'info'
}

const STATUS_CONFIG = {
  fail: {
    icon: XCircle,
    bg: 'bg-red-500/10 border-red-500/30',
    text: 'text-red-400',
    badge: 'destructive' as const,
    label: 'FAIL',
  },
  warn: {
    icon: AlertTriangle,
    bg: 'bg-yellow-500/10 border-yellow-500/30',
    text: 'text-yellow-400',
    badge: 'secondary' as const,
    label: 'WARN',
  },
  pass: {
    icon: CheckCircle2,
    bg: 'bg-green-500/10 border-green-500/30',
    text: 'text-green-400',
    badge: 'default' as const,
    label: 'PASS',
  },
  info: {
    icon: Info,
    bg: 'bg-blue-500/10 border-blue-500/30',
    text: 'text-blue-400',
    badge: 'secondary' as const,
    label: 'INFO',
  },
}

interface DiagnosticSummaryCardProps {
  diagnostics: DiagnosticResult[]
}

export function DiagnosticSummaryCard({ diagnostics }: DiagnosticSummaryCardProps) {
  if (diagnostics.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Diagnostic Overview</CardTitle>
        </CardHeader>
        <CardContent className="py-8 text-center space-y-2">
          <Info className="w-8 h-8 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">No diagnostic checks were run.</p>
          <p className="text-xs text-muted-foreground/70">
            Upload calibration tables (CSV / .bin) to enable full diagnostic analysis.
          </p>
        </CardContent>
      </Card>
    )
  }

  const totalFail = diagnostics.filter((d) => d.status === 'fail').length
  const totalWarn = diagnostics.filter((d) => d.status === 'warn').length
  const totalPass = diagnostics.filter((d) => d.status === 'pass').length

  const bySystem: SystemStatus[] = SYSTEMS.map((system) => {
    const systemChecks = diagnostics.filter((d) => d.system === system)
    return {
      system,
      fail: systemChecks.filter((d) => d.status === 'fail').length,
      warn: systemChecks.filter((d) => d.status === 'warn').length,
      pass: systemChecks.filter((d) => d.status === 'pass').length,
      info: systemChecks.filter((d) => d.status === 'info').length,
    }
  }).filter((s) => s.fail + s.warn + s.pass + s.info > 0)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Diagnostic Overview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall totals */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Critical', count: totalFail, status: 'fail' as const },
            { label: 'Warnings', count: totalWarn, status: 'warn' as const },
            { label: 'Passed', count: totalPass, status: 'pass' as const },
          ].map(({ label, count, status }) => {
            const cfg = STATUS_CONFIG[status]
            const Icon = cfg.icon
            return (
              <div
                key={status}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 p-3 rounded-lg border',
                  cfg.bg
                )}
              >
                <Icon className={cn('w-5 h-5', cfg.text)} />
                <span className={cn('text-2xl font-bold', cfg.text)}>{count}</span>
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            )
          })}
        </div>

        {/* Per-system traffic lights */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            System breakdown
          </p>
          {bySystem.map((s) => {
            const worst = worstStatus(s)
            const cfg = STATUS_CONFIG[worst]
            const Icon = cfg.icon
            return (
              <div
                key={s.system}
                className="flex items-center justify-between py-1.5 px-3 rounded-md bg-card/50 border border-border/50"
              >
                <div className="flex items-center gap-2">
                  <Icon className={cn('w-4 h-4 flex-shrink-0', cfg.text)} />
                  <span className="text-sm font-medium">{SYSTEM_LABELS[s.system]}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {s.fail > 0 && (
                    <Badge variant="destructive" className="text-xs px-1.5 py-0">
                      {s.fail} fail
                    </Badge>
                  )}
                  {s.warn > 0 && (
                    <Badge variant="secondary" className="text-xs px-1.5 py-0 text-yellow-400">
                      {s.warn} warn
                    </Badge>
                  )}
                  {s.pass > 0 && (
                    <Badge variant="outline" className="text-xs px-1.5 py-0 text-green-400">
                      {s.pass} pass
                    </Badge>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Cpu, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AIAnalysisResult } from '@/types/tuneData'

const SEVERITY_CONFIG: Record<number, { label: string; className: string }> = {
  4: { label: 'Critical', className: 'bg-red-500/20 text-red-400 border-red-500/30' },
  3: { label: 'Medium',   className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  2: { label: 'Low',      className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  1: { label: 'Info',     className: 'bg-muted text-muted-foreground border-border' },
}

interface AIAnalysisSummaryProps {
  analysis: AIAnalysisResult
}

export function AIAnalysisSummary({ analysis }: AIAnalysisSummaryProps) {
  return (
    <div className="space-y-4">
      {/* Narrative summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Cpu className="w-4 h-4 text-blue-400" />
            AI Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm prose-invert max-w-none">
            {analysis.summary.split('\n\n').map((para, i) => (
              <p key={i} className="text-sm leading-relaxed text-foreground/90 mb-3 last:mb-0">
                {para}
              </p>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Issues with root cause */}
      {analysis.issues && analysis.issues.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="w-4 h-4 text-yellow-400" />
              Root Cause Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {analysis.issues
              .sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0))
              .map((issue, i) => {
                const sevConfig = SEVERITY_CONFIG[issue.severity ?? 1]
                return (
                  <div key={i} className="p-3 rounded-lg border border-border bg-card/50 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold leading-tight">{issue.title}</p>
                      <span
                        className={cn(
                          'text-xs px-1.5 py-0.5 rounded border flex-shrink-0',
                          sevConfig.className
                        )}
                      >
                        {sevConfig.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {issue.explanation}
                    </p>
                    <div className="pt-1 border-t border-border/50">
                      <p className="text-xs font-medium text-primary/90 leading-relaxed">
                        → {issue.action}
                      </p>
                    </div>
                  </div>
                )
              })}
          </CardContent>
        </Card>
      )}

      {/* Safety warnings */}
      {analysis.safetyWarnings && analysis.safetyWarnings.length > 0 && (
        <div className="p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5 space-y-2">
          <div className="flex items-center gap-2 text-yellow-500">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <p className="text-sm font-semibold">Safety warnings</p>
          </div>
          <ul className="space-y-1.5">
            {analysis.safetyWarnings.map((w, i) => (
              <li key={i} className="text-xs text-yellow-500/90 leading-relaxed flex gap-2">
                <span className="flex-shrink-0 mt-0.5">•</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Table changes (turbo path) */}
      {analysis.tableChanges && analysis.tableChanges.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">AI-Suggested Table Modifications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {analysis.tableChanges.map((tc, i) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
                  <Badge variant="outline" className="text-xs font-mono flex-shrink-0 mt-0.5">
                    {tc.table}
                  </Badge>
                  <div className="space-y-0.5">
                    <p className="text-sm">{tc.change}</p>
                    <p className="text-xs text-muted-foreground">{tc.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Search, Zap, TrendingUp, ArrowLeft, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { UserIntent, UploadedFile } from '@/types/tuneData'

interface IntentScreenProps {
  /** Pass either files (web upload flow) OR a subtitle string (companion app flow) */
  files?: UploadedFile[]
  subtitle?: string
  onBack: () => void
  onContinue: (intent: UserIntent) => void
}

const INTENTS: {
  id: UserIntent
  icon: React.ReactNode
  title: string
  description: string
  badge?: string
}[] = [
  {
    id: 'diagnose',
    icon: <Search className="w-5 h-5 text-green-400" />,
    title: 'Diagnose my tune',
    description:
      'Run automated diagnostic checks across fuelling, ignition, airflow, boost, and thermal systems. Get AI root cause analysis and prioritised recommendations.',
  },
  {
    id: 'na_to_turbo',
    icon: <Zap className="w-5 h-5 text-blue-400" />,
    title: 'NA-to-Turbo conversion',
    description:
      'Generate a safe conservative baseline map for adding forced induction. Scales VE, reduces timing, recalibrates injectors, and creates boost target and wastegate tables.',
    badge: 'Requires hardware specs',
  },
  {
    id: 'performance',
    icon: <TrendingUp className="w-5 h-5 text-yellow-400" />,
    title: 'Performance optimisation',
    description:
      'Get AI-powered recommendations for improving power, drivability, and efficiency on your existing naturally-aspirated build.',
  },
]

export function IntentScreen({ files, subtitle, onBack, onContinue }: IntentScreenProps) {
  const [selected, setSelected] = useState<UserIntent | null>(null)

  const derivedSubtitle =
    subtitle ??
    (files && files.length > 0
      ? `${files[0].type === 'bin' ? 'Binary PCM' : files[0].type === 'hpl' ? 'Datalog' : 'CSV Tables'} · ${files.length} file${files.length !== 1 ? 's' : ''} ready`
      : undefined)

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Title */}
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight">What would you like to do?</h2>
          {derivedSubtitle && (
            <p className="text-sm text-muted-foreground mt-1">{derivedSubtitle}</p>
          )}
        </div>

        {/* Intent cards */}
        <div className="space-y-3">
          {INTENTS.map(({ id, icon, title, description, badge }) => (
            <button
              key={id}
              onClick={() => setSelected(id)}
              className={cn(
                'w-full text-left p-4 rounded-lg border transition-all',
                selected === id
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                  : 'border-border bg-card hover:border-primary/40 hover:bg-card/80'
              )}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex-shrink-0">{icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold">{title}</p>
                    {badge && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full border border-blue-500/40 text-blue-400 bg-blue-500/5">
                        {badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
                </div>
                {/* Selection indicator */}
                <div
                  className={cn(
                    'w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 transition-colors',
                    selected === id
                      ? 'border-primary bg-primary'
                      : 'border-muted-foreground/30'
                  )}
                />
              </div>
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <Button
            className="flex-1 gap-2"
            disabled={!selected}
            onClick={() => selected && onContinue(selected)}
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </main>
  )
}

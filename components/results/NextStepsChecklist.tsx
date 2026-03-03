'use client'

import { useState } from 'react'
import { CheckSquare, Square } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface NextStepsChecklistProps {
  steps: string[]
}

export function NextStepsChecklist({ steps }: NextStepsChecklistProps) {
  const [checked, setChecked] = useState<Set<number>>(new Set())

  const toggle = (i: number) =>
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(i)) { next.delete(i) } else { next.add(i) }
      return next
    })

  const completed = checked.size
  const total = steps.length

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Next Steps</CardTitle>
          <span className="text-xs text-muted-foreground">
            {completed}/{total} completed
          </span>
        </div>
        {/* Progress bar */}
        <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden mt-2">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {steps.map((step, i) => (
          <button
            key={i}
            onClick={() => toggle(i)}
            className={cn(
              'w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors',
              checked.has(i)
                ? 'border-green-500/30 bg-green-500/5 opacity-60'
                : 'border-border hover:border-primary/30 hover:bg-card/80'
            )}
          >
            {checked.has(i) ? (
              <CheckSquare className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
            ) : (
              <Square className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            )}
            <span
              className={cn(
                'text-sm leading-relaxed',
                checked.has(i) && 'line-through text-muted-foreground'
              )}
            >
              {step}
            </span>
          </button>
        ))}
      </CardContent>
    </Card>
  )
}

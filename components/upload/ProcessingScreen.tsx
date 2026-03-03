'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Circle, Loader2, RotateCcw, AlertTriangle, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import type { TuneData, UploadedFile, UserIntent, TurboConversionInputs } from '@/types/tuneData'
import { parseCSV } from '@/lib/parsers/csvParser'
import { parseBIN } from '@/lib/parsers/binParser'
import { parseHPL } from '@/lib/parsers/hplParser'

interface ProcessingStep {
  id: string
  label: string
  status: 'pending' | 'active' | 'done' | 'error'
}

interface ProcessingScreenProps {
  files: UploadedFile[]
  userIntent: UserIntent
  turboInputs?: TurboConversionInputs
  onReset: () => void
}

function makeSteps(): ProcessingStep[] {
  return [
    { id: 'parse', label: 'Parsing calibration data', status: 'pending' },
    { id: 'ingest', label: 'Sending to analysis pipeline', status: 'pending' },
    { id: 'hardware', label: 'Detecting hardware profile', status: 'pending' },
    { id: 'diagnostics', label: 'Running diagnostic checks', status: 'pending' },
    { id: 'ai', label: 'AI analysis in progress', status: 'pending' },
  ]
}

export function ProcessingScreen({ files, userIntent, turboInputs, onReset }: ProcessingScreenProps) {
  const router = useRouter()
  const [steps, setSteps] = useState<ProcessingStep[]>(makeSteps)
  const [progress, setProgress] = useState(0)
  const [isDone, setIsDone] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [parseWarning, setParseWarning] = useState<string | null>(null)
  const ranRef = useRef(false)

  const setStepStatus = (id: string, status: ProcessingStep['status']) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)))
  }

  const markDone = (id: string) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: 'done' } : s))
    )
  }

  useEffect(() => {
    // Guard against React StrictMode double-invocation
    if (ranRef.current) return
    ranRef.current = true

    async function run() {
      try {
        // ── Step 1: Parse ──────────────────────────────────────────────────
        setStepStatus('parse', 'active')
        setProgress(10)

        let tuneData: TuneData

        const fileType = files[0]?.type

        if (fileType === 'csv') {
          const labelled = files
            .filter((f) => f.label)
            .map((f) => ({ file: f.file, label: f.label! }))
          tuneData = await parseCSV(labelled)
        } else if (fileType === 'bin') {
          tuneData = await parseBIN(files[0].file)
        } else {
          tuneData = await parseHPL(files[0].file)
        }

        // Check for parse warnings (e.g. unknown OS version)
        const warn = (tuneData as TuneData & { _parseWarning?: string })._parseWarning
        if (warn) {
          setParseWarning(warn)
        } else if (fileType !== 'hpl' && Object.keys(tuneData.tables).length === 0) {
          // CSV/BIN with no tables extracted — HPL legitimately has empty tables
          setParseWarning(
            'No calibration tables were extracted from your file. Diagnostic checks will be limited. ' +
            'Verify your file format or try exporting individual tables as CSV.'
          )
        }

        // Store parsed data in sessionStorage for downstream pages (Sprint 8+)
        sessionStorage.setItem('tuneData', JSON.stringify(tuneData))

        markDone('parse')
        setProgress(20)

        // ── Step 2: POST to /api/analyse ───────────────────────────────────

        const res = await fetch('/api/analyse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tuneData,
            userIntent,
            ...(turboInputs ? { turboInputs } : {}),
          }),
        })

        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? `Server error ${res.status}`)
        }

        const analysisResult = await res.json()

        // Store full result in sessionStorage for results page
        sessionStorage.setItem('analysisResult', JSON.stringify(analysisResult))
        sessionStorage.setItem('sessionId', analysisResult.sessionId)
        setSessionId(analysisResult.sessionId)

        markDone('ingest')
        setProgress(50)

        // Mark remaining pipeline steps as done (already ran server-side)
        for (const [stepId, pct] of [
          ['hardware', 65],
          ['diagnostics', 80],
          ['ai', 95],
        ] as [string, number][]) {
          setStepStatus(stepId, 'active')
          setProgress(pct)
          await delay(400)
          markDone(stepId)
        }

        setProgress(100)
        setIsDone(true)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        setError(msg)
        // Mark the currently-active step as errored
        setSteps((prev) =>
          prev.map((s) => (s.status === 'active' ? { ...s, status: 'error' } : s))
        )
      }
    }

    run()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fileTypeLabel =
    files[0]?.type === 'bin' ? 'Binary PCM' : files[0]?.type === 'hpl' ? 'Datalog' : 'CSV Tables'

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Title */}
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight">
            {error ? 'Processing failed' : isDone ? 'Analysis complete' : 'Analysing your tune'}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {fileTypeLabel} · {files.length} file{files.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Progress card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              <span>Processing pipeline</span>
              <span className="text-foreground font-bold">{progress}%</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={progress} className="h-2" />

            <div className="space-y-3">
              {steps.map((step) => (
                <div key={step.id} className="flex items-center gap-3">
                  {step.status === 'done' ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                  ) : step.status === 'active' ? (
                    <Loader2 className="w-5 h-5 text-primary animate-spin flex-shrink-0" />
                  ) : step.status === 'error' ? (
                    <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0" />
                  ) : (
                    <Circle className="w-5 h-5 text-muted-foreground/30 flex-shrink-0" />
                  )}
                  <span
                    className={cn(
                      'text-sm',
                      step.status === 'done' && 'text-foreground',
                      step.status === 'active' && 'text-primary font-medium',
                      step.status === 'error' && 'text-destructive',
                      step.status === 'pending' && 'text-muted-foreground'
                    )}
                  >
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Parse warning (e.g. unknown OS version in .bin) */}
        {parseWarning && (
          <div className="flex items-start gap-2 p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5">
            <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-yellow-500/90">{parseWarning}</p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="p-3 rounded-lg border border-destructive/50 bg-destructive/5">
            <p className="text-sm text-destructive font-medium mb-1">Error</p>
            <p className="text-xs text-destructive/80">{error}</p>
          </div>
        )}

        {/* File summary */}
        <Card className="bg-card/50">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">
              Files processed
            </p>
            <div className="space-y-1">
              {files.map((f) => (
                <div key={f.id} className="flex items-center justify-between text-sm">
                  <span className="truncate">{f.name}</span>
                  {f.label && (
                    <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">
                      {f.label}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        {(isDone || error) && (
          <div className="flex flex-col gap-2">
            {isDone && sessionId && (
              <Button
                className="w-full gap-2"
                onClick={() => router.push(`/results?session=${sessionId}`)}
              >
                View Results
                <ArrowRight className="w-4 h-4" />
              </Button>
            )}
            <Button variant="outline" onClick={onReset} className="w-full gap-2">
              <RotateCcw className="w-4 h-4" />
              Upload another file
            </Button>
          </div>
        )}
      </div>
    </main>
  )
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  Loader2,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Circle,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { IntentScreen } from '@/components/upload/IntentScreen'
import { TurboInputsForm } from '@/components/upload/TurboInputsForm'
import { cn } from '@/lib/utils'
import type { UserIntent, TurboConversionInputs } from '@/types/tuneData'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TuneDataMeta {
  source: string
  vehicle: { osVersion?: string | null; ecuType?: string | null; platform?: string | null }
  rawFlags: {
    isForcedInduction: boolean
    hasFlexFuel: boolean
    hasBoostControl: boolean
    detectedInjectorSize_cc: number | null
  }
  hasDatalog: boolean
  tableKeys: string[]
}

type Stage = 'loading' | 'error' | 'intent' | 'turbo-inputs' | 'analysing'

interface AnalysisStep {
  id: string
  label: string
  status: 'pending' | 'active' | 'done' | 'error'
}

function makeSteps(intent: UserIntent): AnalysisStep[] {
  const steps: AnalysisStep[] = [
    { id: 'hardware', label: 'Detecting hardware profile', status: 'pending' },
    { id: 'diagnostics', label: 'Running diagnostic checks', status: 'pending' },
    { id: 'ai', label: 'AI analysis in progress', status: 'pending' },
  ]
  if (intent === 'na_to_turbo') {
    steps.push({ id: 'turbo', label: 'Generating turbo baseline maps', status: 'pending' })
  }
  return steps
}

// ─── Inner component (uses useSearchParams — must be inside Suspense) ─────────

function IntentInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const sessionId = searchParams.get('session')

  const [stage, setStage] = useState<Stage>('loading')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [meta, setMeta] = useState<TuneDataMeta | null>(null)
  const [userIntent, setUserIntent] = useState<UserIntent>('diagnose')
  const [turboInputs, setTurboInputs] = useState<TurboConversionInputs | undefined>(undefined)

  // ── Load session metadata ─────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) {
      router.replace('/')
      return
    }

    async function load() {
      try {
        const res = await fetch(`/api/session/${sessionId}`)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? `Session error ${res.status}`)
        }
        const data = await res.json()
        if (!data.tuneDataMeta) throw new Error('Session has no tune data')
        setMeta(data.tuneDataMeta as TuneDataMeta)
        setStage('intent')
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to load session')
        setStage('error')
      }
    }

    load()
  }, [sessionId, router])

  // ── Intent selected ───────────────────────────────────────────────────────
  const handleIntentContinue = (intent: UserIntent) => {
    setUserIntent(intent)
    if (intent === 'na_to_turbo') {
      setStage('turbo-inputs')
    } else {
      setTurboInputs(undefined)
      setStage('analysing')
    }
  }

  // ── Turbo inputs confirmed ────────────────────────────────────────────────
  const handleTurboStart = (inputs: TurboConversionInputs) => {
    setTurboInputs(inputs)
    setStage('analysing')
  }

  // ── Build intent subtitle from session metadata ───────────────────────────
  const subtitle = meta
    ? [
        meta.source === 'companion_app' ? 'Companion App' : meta.source.toUpperCase(),
        meta.vehicle.platform,
        meta.tableKeys.length > 0 ? `${meta.tableKeys.length} tables` : null,
        meta.hasDatalog ? 'datalog included' : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined

  // ── Render ────────────────────────────────────────────────────────────────

  if (stage === 'loading') {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-sm">Loading your tune data…</p>
        </div>
      </main>
    )
  }

  if (stage === 'error') {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center max-w-md space-y-4">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto" />
          <h2 className="text-xl font-bold">Session not found</h2>
          <p className="text-sm text-muted-foreground">
            {errorMsg ?? 'This link may have expired. Sessions are valid for 1 hour.'}
          </p>
          <Button onClick={() => router.push('/')} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Upload a file
          </Button>
        </div>
      </main>
    )
  }

  if (stage === 'intent') {
    return (
      <IntentScreen
        subtitle={subtitle}
        onBack={() => router.push('/')}
        onContinue={handleIntentContinue}
      />
    )
  }

  if (stage === 'turbo-inputs') {
    return (
      <TurboInputsForm
        onBack={() => setStage('intent')}
        onStart={handleTurboStart}
      />
    )
  }

  // stage === 'analysing'
  return (
    <AnalysingView
      sessionId={sessionId!}
      userIntent={userIntent}
      turboInputs={turboInputs}
      meta={meta}
      onDone={(resultSessionId) => router.push(`/results?session=${resultSessionId}`)}
      onError={(msg) => {
        setErrorMsg(msg)
        setStage('error')
      }}
    />
  )
}

// ─── Analysing view ───────────────────────────────────────────────────────────

interface AnalysingViewProps {
  sessionId: string
  userIntent: UserIntent
  turboInputs?: TurboConversionInputs
  meta: TuneDataMeta | null
  onDone: (sessionId: string) => void
  onError: (msg: string) => void
}

function AnalysingView({
  sessionId,
  userIntent,
  turboInputs,
  meta,
  onDone,
  onError,
}: AnalysingViewProps) {
  const [steps, setSteps] = useState<AnalysisStep[]>(() => makeSteps(userIntent))
  const [progress, setProgress] = useState(0)
  const ranRef = useRef(false)

  const setStepStatus = (id: string, status: AnalysisStep['status']) =>
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)))

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    async function run() {
      try {
        // Animate first step active while the API call runs
        setStepStatus('hardware', 'active')
        setProgress(10)

        const res = await fetch('/api/analyse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            userIntent,
            ...(turboInputs ? { turboInputs } : {}),
          }),
        })

        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? `Server error ${res.status}`)
        }

        const analysisResult = await res.json()

        // Animate remaining pipeline steps with short delays
        const stepSequence: [string, number][] =
          userIntent === 'na_to_turbo'
            ? [['hardware', 35], ['diagnostics', 55], ['ai', 80], ['turbo', 95]]
            : [['hardware', 35], ['diagnostics', 60], ['ai', 95]]

        for (const [stepId, pct] of stepSequence) {
          setStepStatus(stepId, 'done')
          setProgress(pct)
          await delay(350)
        }

        setProgress(100)

        // Store in sessionStorage so results page gets the fast path
        sessionStorage.setItem('analysisResult', JSON.stringify(analysisResult))
        sessionStorage.setItem(
          'tuneData',
          JSON.stringify({
            source: meta?.source ?? 'companion_app',
            vehicle: meta?.vehicle ?? {},
            tables: {},
            rawFlags: meta?.rawFlags ?? {
              isForcedInduction: false,
              hasFlexFuel: false,
              hasBoostControl: false,
              detectedInjectorSize_cc: null,
            },
          })
        )

        await delay(300)
        onDone(analysisResult.sessionId)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        setSteps((prev) =>
          prev.map((s) => (s.status === 'active' ? { ...s, status: 'error' } : s))
        )
        onError(msg)
      }
    }

    run()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const intentLabel =
    userIntent === 'na_to_turbo'
      ? 'NA-to-Turbo conversion'
      : userIntent === 'performance'
      ? 'Performance optimisation'
      : 'Diagnostic analysis'

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight">Analysing your tune</h2>
          <p className="text-sm text-muted-foreground mt-1">{intentLabel}</p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              <span>Analysis pipeline</span>
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

        {/* Session info card */}
        {meta && (
          <Card className="bg-card/50">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-3.5 h-3.5 text-primary" />
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Tune data
                </p>
              </div>
              <div className="space-y-1 text-sm">
                {meta.vehicle.platform && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Platform</span>
                    <span>{meta.vehicle.platform}</span>
                  </div>
                )}
                {meta.vehicle.osVersion && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">OS Version</span>
                    <span className="font-mono text-xs">{meta.vehicle.osVersion}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tables</span>
                  <span>{meta.tableKeys.join(', ') || 'None detected'}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  )
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── Page shell with Suspense boundary ───────────────────────────────────────

export default function IntentPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm">Loading…</p>
          </div>
        </main>
      }
    >
      <IntentInner />
    </Suspense>
  )
}

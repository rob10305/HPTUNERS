'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CSVUploadPanel, BINUploadPanel, HPLUploadPanel } from '@/components/upload/UploadPanel'
import { ProcessingScreen } from '@/components/upload/ProcessingScreen'
import { IntentScreen } from '@/components/upload/IntentScreen'
import { TurboInputsForm } from '@/components/upload/TurboInputsForm'
import { FileText, Binary, Activity, Zap, ShieldCheck, Cpu } from 'lucide-react'
import type { UploadedFile, UserIntent, TurboConversionInputs } from '@/types/tuneData'

type AppState = 'upload' | 'intent' | 'turbo-inputs' | 'processing'

export default function HomePage() {
  const [appState, setAppState] = useState<AppState>('upload')
  const [pendingFiles, setPendingFiles] = useState<UploadedFile[]>([])
  const [userIntent, setUserIntent] = useState<UserIntent>('diagnose')
  const [turboInputs, setTurboInputs] = useState<TurboConversionInputs | undefined>(undefined)

  // ── Upload complete → intent selection ─────────────────────────────────────
  const handleFilesReady = (files: UploadedFile[]) => {
    setPendingFiles(files)
    setAppState('intent')
  }

  // ── Intent selected ─────────────────────────────────────────────────────────
  const handleIntentContinue = (intent: UserIntent) => {
    setUserIntent(intent)
    if (intent === 'na_to_turbo') {
      setAppState('turbo-inputs')
    } else {
      setTurboInputs(undefined)
      setAppState('processing')
    }
  }

  // ── Turbo inputs confirmed → processing ────────────────────────────────────
  const handleTurboStart = (inputs: TurboConversionInputs) => {
    setTurboInputs(inputs)
    setAppState('processing')
  }

  // ── Reset to upload ─────────────────────────────────────────────────────────
  const handleReset = () => {
    setPendingFiles([])
    setUserIntent('diagnose')
    setTurboInputs(undefined)
    setAppState('upload')
  }

  // ── Routing ─────────────────────────────────────────────────────────────────
  if (appState === 'intent') {
    return (
      <IntentScreen
        files={pendingFiles}
        onBack={handleReset}
        onContinue={handleIntentContinue}
      />
    )
  }

  if (appState === 'turbo-inputs') {
    return (
      <TurboInputsForm
        onBack={() => setAppState('intent')}
        onStart={handleTurboStart}
      />
    )
  }

  if (appState === 'processing') {
    return (
      <ProcessingScreen
        files={pendingFiles}
        userIntent={userIntent}
        turboInputs={turboInputs}
        onReset={handleReset}
      />
    )
  }

  // ── Upload screen ───────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight">HP Tuners AI Tune Advisor</h1>
              <p className="text-xs text-muted-foreground">ECU Calibration Diagnostic Tool</p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs hidden sm:flex">
            GM LS/LT Platform
          </Badge>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 py-12 text-center">
        <Badge className="mb-4 text-xs" variant="secondary">
          AI-Powered Analysis
        </Badge>
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
          Diagnose &amp; optimise your engine tune
        </h2>
        <p className="text-muted-foreground max-w-2xl mx-auto text-base sm:text-lg">
          Upload your calibration files or datalog. Get an automated diagnostic report, AI-generated
          recommendations, and — if you&apos;re adding forced induction — a complete baseline map
          for your new hardware.
        </p>
      </section>

      {/* Feature highlights */}
      <section className="max-w-6xl mx-auto px-4 pb-10">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
          <div className="flex items-start gap-3 p-4 rounded-lg bg-card border border-border">
            <ShieldCheck className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">Automated Diagnostics</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                20+ checks across fuelling, ignition, airflow, boost, and thermal systems
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 rounded-lg bg-card border border-border">
            <Cpu className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">AI-Powered Analysis</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Claude AI explains root causes and generates prioritised recommendations
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 rounded-lg bg-card border border-border">
            <Zap className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">Turbo Map Generator</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                NA-to-turbo baseline map with VE, spark, injector scaling, and boost tables
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Upload Section */}
      <section className="max-w-3xl mx-auto px-4 pb-16">
        <Card className="border-border shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg">Upload your calibration data</CardTitle>
            <CardDescription>
              Choose the upload method that matches your available files
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="csv">
              <TabsList className="grid w-full grid-cols-3 mb-6">
                <TabsTrigger value="csv" className="gap-2 text-xs sm:text-sm">
                  <FileText className="w-4 h-4" />
                  CSV Tables
                </TabsTrigger>
                <TabsTrigger value="bin" className="gap-2 text-xs sm:text-sm">
                  <Binary className="w-4 h-4" />
                  .bin File
                </TabsTrigger>
                <TabsTrigger value="hpl" className="gap-2 text-xs sm:text-sm">
                  <Activity className="w-4 h-4" />
                  .hpl Datalog
                </TabsTrigger>
              </TabsList>

              <TabsContent value="csv">
                <div className="space-y-1 mb-4">
                  <h3 className="text-sm font-semibold">CSV Table Export</h3>
                  <p className="text-xs text-muted-foreground">
                    Best for: detailed tune analysis when you can export tables from VCM Editor
                  </p>
                </div>
                <CSVUploadPanel onReady={handleFilesReady} />
              </TabsContent>

              <TabsContent value="bin">
                <div className="space-y-1 mb-4">
                  <h3 className="text-sm font-semibold">Raw PCM Binary</h3>
                  <p className="text-xs text-muted-foreground">
                    Best for: older GM vehicles with supported OS versions (LS1, LS3)
                  </p>
                </div>
                <BINUploadPanel onReady={handleFilesReady} />
              </TabsContent>

              <TabsContent value="hpl">
                <div className="space-y-1 mb-4">
                  <h3 className="text-sm font-semibold">VCM Scanner Datalog</h3>
                  <p className="text-xs text-muted-foreground">
                    Best for: analysing real-world drive data, STFT/LTFT, knock events
                  </p>
                </div>
                <HPLUploadPanel onReady={handleFilesReady} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Disclaimer */}
        <div className="mt-6 p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5">
          <p className="text-xs text-yellow-500/90 leading-relaxed">
            <strong>⚠️ Safety Notice:</strong> This tool provides a starting point analysis only.
            All outputs must be verified on a dynamometer by a qualified tuner before any
            wide-open-throttle operation. Incorrect calibration can cause serious engine damage.
            Always monitor wideband O2 and knock activity.
          </p>
        </div>
      </section>
    </main>
  )
}

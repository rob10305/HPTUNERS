import { NextRequest, NextResponse } from 'next/server'
import { createSession, getSession, updateSession } from '@/lib/sessionStore'
import { detectHardware } from '@/lib/hardwareDetector'
import { runDiagnostics } from '@/lib/diagnostics'
import { runAIAnalysis } from '@/lib/aiAnalysis'
import { generateTurboMap } from '@/lib/turboMapGenerator'
import type { TuneData, UserIntent, TurboConversionInputs } from '@/types/tuneData'

/**
 * POST /api/analyse
 *
 * Accepts either:
 *   { tuneData, userIntent, turboInputs? }        — web upload flow (client-parsed)
 *   { sessionId, userIntent, turboInputs? }        — companion app flow (data already in session)
 *
 * Runs the full analysis pipeline and returns results.
 *
 * Pipeline phases:
 *   1. Hardware detection   ✅ Sprint 3
 *   2. Diagnostic checks    ✅ Sprint 4
 *   3. AI analysis          ✅ Sprint 5
 *   4. Map generation       ✅ Sprint 6 (na_to_turbo only)
 */
export async function POST(req: NextRequest) {
  let body: unknown

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    tuneData: bodyTuneData,
    sessionId: incomingSessionId,
    userIntent,
    turboInputs,
  } = body as {
    tuneData?: TuneData
    sessionId?: string
    userIntent: UserIntent
    turboInputs?: TurboConversionInputs
  }

  if (!userIntent) {
    return NextResponse.json(
      { error: 'Request must include userIntent' },
      { status: 400 }
    )
  }

  // ── Resolve tuneData and sessionId ─────────────────────────────────────────
  let tuneData: TuneData
  let sessionId: string

  if (bodyTuneData) {
    // Web upload flow: create a new session
    const session = createSession(bodyTuneData)
    sessionId = session.sessionId
    tuneData = bodyTuneData
    updateSession(sessionId, { userIntent })
  } else if (incomingSessionId) {
    // Companion app flow: retrieve from existing session (data already ingested)
    const session = getSession(incomingSessionId)
    if (!session?.tuneData) {
      return NextResponse.json(
        { error: 'Session not found or expired' },
        { status: 404 }
      )
    }
    sessionId = incomingSessionId
    tuneData = session.tuneData
    updateSession(sessionId, { userIntent })
  } else {
    return NextResponse.json(
      { error: 'Request must include either tuneData or sessionId' },
      { status: 400 }
    )
  }

  // ── 2. Hardware detection ──────────────────────────────────────────────────
  const hardware = detectHardware(tuneData)
  updateSession(sessionId, { hardware })

  // ── 3. Diagnostic checks ───────────────────────────────────────────────────
  const diagnostics = runDiagnostics(tuneData, hardware)
  updateSession(sessionId, { diagnostics })

  // ── 4. AI analysis ─────────────────────────────────────────────────────────
  const aiAnalysis = await runAIAnalysis(
    tuneData,
    hardware,
    diagnostics,
    userIntent,
    turboInputs
  )
  updateSession(sessionId, { aiAnalysis })

  // ── 5. Turbo map generation (na_to_turbo only) ─────────────────────────────
  let turboMapResult = null
  if (userIntent === 'na_to_turbo') {
    if (!turboInputs) {
      return NextResponse.json(
        { error: 'turboInputs required for na_to_turbo intent' },
        { status: 400 }
      )
    }
    turboMapResult = generateTurboMap(tuneData, turboInputs)
    // Store without the modifiedCellIndex (Set isn't JSON-serialisable) — rebuilt client-side
    updateSession(sessionId, { turboMapResult })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const summary = {
    fail: diagnostics.filter((d) => d.status === 'fail').length,
    warn: diagnostics.filter((d) => d.status === 'warn').length,
    pass: diagnostics.filter((d) => d.status === 'pass').length,
    info: diagnostics.filter((d) => d.status === 'info').length,
  }

  return NextResponse.json({
    sessionId,
    status: 'complete',
    hardware,
    diagnostics,
    summary,
    aiAnalysis,
    turboMapResult: turboMapResult
      ? {
          modifiedTuneData: turboMapResult.modifiedTuneData,
          modifications: turboMapResult.modifications,
          modifiedTables: turboMapResult.modifiedTables,
          warnings: turboMapResult.warnings,
          // modifiedCellIndex excluded from JSON — rebuilt from modifications on client
        }
      : null,
    resultsUrl: `${appUrl}/results?session=${sessionId}`,
  })
}

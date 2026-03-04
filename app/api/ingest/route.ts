import { NextRequest, NextResponse } from 'next/server'
import { createSession } from '@/lib/sessionStore'
import type { TuneData } from '@/types/tuneData'

/**
 * POST /api/ingest
 *
 * Companion app endpoint. Accepts pre-parsed TuneData JSON, stores it in the
 * session store, and returns a sessionId + redirectUrl so the companion app can
 * open the user's browser to the intent-selection page.
 *
 * Auth: If COMPANION_API_KEY is set in env, the request must include a matching
 *       x-api-key header. If the env var is unset, auth is skipped (dev mode).
 *
 * Flow:
 *   Companion app → POST /api/ingest → { sessionId, redirectUrl }
 *                                              ↓
 *                                   Browser opens /intent?session=<id>
 *                                              ↓
 *                                   User picks intent → /api/analyse (sessionId)
 *                                              ↓
 *                                   /results?session=<id>
 */
export async function POST(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const requiredKey = process.env.COMPANION_API_KEY
  if (requiredKey) {
    const providedKey = req.headers.get('x-api-key')
    if (providedKey !== requiredKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // ── Parse body ───────────────────────────────────────────────────────────
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // ── Schema validation ─────────────────────────────────────────────────────
  const validation = validateTuneData(body)
  if (!validation.valid) {
    return NextResponse.json(
      { error: 'Invalid TuneData schema', details: validation.errors },
      { status: 422 }
    )
  }

  const tuneData = body as TuneData

  // ── Store session ─────────────────────────────────────────────────────────
  const session = createSession(tuneData)
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').trim()
  const redirectUrl = `${appUrl}/intent?session=${session.sessionId}`

  return NextResponse.json(
    {
      sessionId: session.sessionId,
      redirectUrl,
      expiresIn: 3600, // seconds — client hint for session TTL
    },
    { status: 201 }
  )
}

// ── Schema validation ─────────────────────────────────────────────────────────

interface ValidationResult {
  valid: boolean
  errors: string[]
}

function validateTuneData(data: unknown): ValidationResult {
  const errors: string[] = []

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Body must be a JSON object'] }
  }

  const d = data as Record<string, unknown>

  // source
  const validSources = ['csv', 'bin', 'hpl', 'companion_app']
  if (!validSources.includes(d.source as string)) {
    errors.push(`source must be one of: ${validSources.join(', ')}`)
  }

  // vehicle
  if (!d.vehicle || typeof d.vehicle !== 'object') {
    errors.push('vehicle must be an object')
  }

  // tables
  if (!d.tables || typeof d.tables !== 'object') {
    errors.push('tables must be an object')
  }

  // rawFlags
  if (!d.rawFlags || typeof d.rawFlags !== 'object') {
    errors.push('rawFlags must be an object')
  } else {
    const flags = d.rawFlags as Record<string, unknown>
    if (typeof flags.isForcedInduction !== 'boolean') {
      errors.push('rawFlags.isForcedInduction must be boolean')
    }
    if (typeof flags.hasFlexFuel !== 'boolean') {
      errors.push('rawFlags.hasFlexFuel must be boolean')
    }
    if (typeof flags.hasBoostControl !== 'boolean') {
      errors.push('rawFlags.hasBoostControl must be boolean')
    }
  }

  return { valid: errors.length === 0, errors }
}

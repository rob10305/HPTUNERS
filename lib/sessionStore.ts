/**
 * In-memory session store.
 * MVP only — no persistence. Sessions expire after 1 hour.
 * On Vercel, this resets between cold starts; acceptable for MVP.
 */

import type { TuneData, HardwareProfile, DiagnosticResult, AIAnalysisResult, UserIntent, TurboMapResult } from '@/types/tuneData'

export interface SessionData {
  sessionId: string
  createdAt: number
  tuneData: TuneData | null
  hardware: HardwareProfile | null
  diagnostics: DiagnosticResult[] | null
  aiAnalysis: AIAnalysisResult | null
  userIntent: UserIntent | null
  turboMapResult: TurboMapResult | null
}

const SESSION_TTL_MS = 60 * 60 * 1000 // 1 hour

// Attach the store to `global` so it survives Next.js hot-module reloading in
// development, where each route handler file gets its own module sandbox.
// In production this is simply a module-level singleton as usual.
declare global {
  // eslint-disable-next-line no-var
  var __hptuners_sessions: Map<string, SessionData> | undefined
}

const store: Map<string, SessionData> =
  global.__hptuners_sessions ?? (global.__hptuners_sessions = new Map())

function purgeExpired(): void {
  const now = Date.now()
  store.forEach((session, id) => {
    if (now - session.createdAt > SESSION_TTL_MS) {
      store.delete(id)
    }
  })
}

export function createSession(tuneData: TuneData): SessionData {
  purgeExpired()
  const sessionId = crypto.randomUUID()
  const session: SessionData = {
    sessionId,
    createdAt: Date.now(),
    tuneData,
    hardware: null,
    diagnostics: null,
    aiAnalysis: null,
    userIntent: null,
    turboMapResult: null,
  }
  store.set(sessionId, session)
  return session
}

export function getSession(sessionId: string): SessionData | null {
  const session = store.get(sessionId)
  if (!session) return null
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    store.delete(sessionId)
    return null
  }
  return session
}

export function updateSession(sessionId: string, updates: Partial<SessionData>): SessionData | null {
  const session = store.get(sessionId)
  if (!session) return null
  const updated = { ...session, ...updates }
  store.set(sessionId, updated)
  return updated
}

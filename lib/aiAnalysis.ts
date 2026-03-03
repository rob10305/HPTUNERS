import Anthropic from '@anthropic-ai/sdk'
import type {
  TuneData,
  HardwareProfile,
  DiagnosticResult,
  AIAnalysisResult,
  UserIntent,
  TurboConversionInputs,
} from '@/types/tuneData'

// ─── Constants ─────────────────────────────────────────────────────────────────

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'
const MAX_TOKENS = 4096
const RETRY_DELAY_MS = 12000

// ─── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert automotive ECU calibration engineer with deep knowledge of HP Tuners VCM Suite and GM LS/LT platform engines. You will be given structured diagnostic data from an engine calibration file analysis. Your job is to:
1. Write a clear, prioritised diagnostic summary in plain English
2. Explain the root cause of each issue found
3. Provide a specific, actionable next steps list ordered by priority
4. If the user is doing a NA-to-turbo conversion, generate a complete table modification plan
5. Always include safety warnings where relevant
6. Never suggest changes that could cause immediate engine damage
7. Always recommend wideband O2 monitoring and professional dyno verification

Respond ONLY with valid JSON (no markdown, no code blocks, no preamble) matching exactly this schema:
{
  "summary": "string — 2-4 paragraph narrative diagnostic summary",
  "issues": [
    {
      "title": "string",
      "explanation": "string — root cause analysis",
      "action": "string — specific corrective action",
      "severity": 1-4
    }
  ],
  "nextSteps": ["string — ordered action items"],
  "safetyWarnings": ["string"],
  "tableChanges": [
    {
      "table": "string — table name",
      "change": "string — what to change and by how much",
      "reason": "string"
    }
  ]
}

The tableChanges array is only required for na_to_turbo intent. For other intents, omit it or return an empty array.
Severity scale: 1=informational, 2=low priority, 3=medium, 4=critical.
Order issues from highest severity to lowest.`

// ─── Prompt builder ────────────────────────────────────────────────────────────

/**
 * Summarise a 2D table into metadata only — avoid sending thousands of floats to the API.
 */
function summarise2D(table: number[][] | undefined): object | null {
  if (!table || table.length === 0) return null
  const flat = table.flat().filter(isFinite)
  if (flat.length === 0) return null
  const min = Math.min(...flat)
  const max = Math.max(...flat)
  const avg = flat.reduce((a, b) => a + b, 0) / flat.length
  return {
    rows: table.length,
    cols: table[0].length,
    min: +min.toFixed(2),
    max: +max.toFixed(2),
    avg: +avg.toFixed(2),
  }
}

function summarise1D(table: number[] | undefined): object | null {
  if (!table || table.length === 0) return null
  const valid = table.filter(isFinite)
  if (valid.length === 0) return null
  return {
    count: valid.length,
    min: +Math.min(...valid).toFixed(3),
    max: +Math.max(...valid).toFixed(3),
    avg: +(valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(3),
  }
}

function buildUserMessage(
  tuneData: TuneData,
  hardware: HardwareProfile,
  diagnostics: DiagnosticResult[],
  userIntent: UserIntent,
  turboInputs?: TurboConversionInputs
): string {
  // Strip the actual table arrays — send only summaries to manage token count
  const tablesSummary = {
    VE: summarise2D(tuneData.tables.VE),
    spark: summarise2D(tuneData.tables.spark),
    MAF: summarise1D(tuneData.tables.MAF),
    WOT_AFR: summarise1D(tuneData.tables.WOT_AFR),
    IAT_correction: summarise2D(tuneData.tables.IAT_correction),
    boostTarget: summarise2D(tuneData.tables.boostTarget),
    wastegate_DC: summarise2D(tuneData.tables.wastegate_DC),
    injectorFlow: tuneData.tables.injectorFlow ?? null,
    revLimit: tuneData.tables.revLimit ?? null,
  }

  const datalogSummary = tuneData.datalog
    ? {
        channels: tuneData.datalog.channels,
        sampleCount: tuneData.datalog.rows.length,
        rpmRange: (() => {
          const rpms = tuneData.datalog.rows
            .map((r) => r.RPM)
            .filter((v): v is number => v !== undefined && isFinite(v))
          return rpms.length
            ? { min: Math.min(...rpms), max: Math.max(...rpms) }
            : null
        })(),
      }
    : null

  // Only include non-info diagnostics in the prompt to keep it focused
  const significantDiagnostics = diagnostics.filter(
    (d) => d.status !== 'info' || d.severity >= 2
  )

  const payload: Record<string, unknown> = {
    userIntent,
    vehicle: tuneData.vehicle,
    hardware,
    tablesSummary,
    datalogSummary,
    diagnostics: significantDiagnostics.map((d) => ({
      system: d.system,
      check: d.check,
      status: d.status,
      severity: d.severity,
      finding: d.finding,
      recommendation: d.recommendation,
      value: d.value,
      limit: d.limit,
    })),
    diagnosticSummary: {
      totalChecks: diagnostics.length,
      fail: diagnostics.filter((d) => d.status === 'fail').length,
      warn: diagnostics.filter((d) => d.status === 'warn').length,
      pass: diagnostics.filter((d) => d.status === 'pass').length,
    },
  }

  if (userIntent === 'na_to_turbo' && turboInputs) {
    payload.turboConversionInputs = turboInputs
  }

  return JSON.stringify(payload, null, 2)
}

// ─── JSON extraction ───────────────────────────────────────────────────────────

/**
 * Extract a JSON object from Claude's response text.
 * Handles clean JSON, markdown code-fenced JSON, and JSON with leading/trailing prose.
 */
function extractJSON(text: string): AIAnalysisResult {
  // 1. Try direct parse
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed) as AIAnalysisResult
  } catch {
    // continue
  }

  // 2. Try stripping markdown code fences
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]) as AIAnalysisResult
    } catch {
      // continue
    }
  }

  // 3. Try finding the outermost JSON object
  const startIdx = trimmed.indexOf('{')
  const endIdx = trimmed.lastIndexOf('}')
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    try {
      return JSON.parse(trimmed.slice(startIdx, endIdx + 1)) as AIAnalysisResult
    } catch {
      // continue
    }
  }

  throw new Error('Could not extract valid JSON from AI response')
}

// ─── Fallback result ────────────────────────────────────────────────────────────

function buildFallback(reason: string, diagnostics: DiagnosticResult[]): AIAnalysisResult {
  const criticalIssues = diagnostics.filter((d) => d.status === 'fail')
  const warnings = diagnostics.filter((d) => d.status === 'warn')

  return {
    summary: `AI narrative analysis is currently unavailable (${reason}). The automated diagnostic checks above have been completed and contain all findings. Please review the issues list for specific recommendations.`,
    issues: [
      ...criticalIssues.map((d) => ({
        title: d.check,
        explanation: d.finding,
        action: d.recommendation,
        severity: d.severity,
      })),
      ...warnings.map((d) => ({
        title: d.check,
        explanation: d.finding,
        action: d.recommendation,
        severity: d.severity,
      })),
    ],
    nextSteps: [
      'Review all FAIL items in the diagnostic results and address them before operating the vehicle.',
      'Upload a VCM Scanner datalog for more detailed fuelling and knock analysis.',
      'Have all calibration changes verified on a dynamometer with wideband O2 monitoring.',
      'Consult a professional HP Tuners calibrator for critical issues.',
    ],
    safetyWarnings: [
      'Always monitor wideband O2 during any WOT operation.',
      'Professional dyno verification is required before any high-load driving.',
      'This diagnostic report is a starting point only — not a substitute for professional calibration.',
    ],
    tableChanges: [],
  }
}

// ─── Main export ────────────────────────────────────────────────────────────────

export async function runAIAnalysis(
  tuneData: TuneData,
  hardware: HardwareProfile,
  diagnostics: DiagnosticResult[],
  userIntent: UserIntent,
  turboInputs?: TurboConversionInputs
): Promise<AIAnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    console.warn('ANTHROPIC_API_KEY not set — returning fallback AI analysis')
    return buildFallback('ANTHROPIC_API_KEY not configured', diagnostics)
  }

  const client = new Anthropic({ apiKey })
  const userMessage = buildUserMessage(tuneData, hardware, diagnostics, userIntent, turboInputs)

  let lastError: Error | null = null

  // One retry for rate limit / transient errors
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      })

      const textBlock = response.content.find((b) => b.type === 'text')
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text content in API response')
      }

      const parsed = extractJSON(textBlock.text)

      // Validate required fields
      if (!parsed.summary || !Array.isArray(parsed.nextSteps)) {
        throw new Error('AI response missing required fields (summary, nextSteps)')
      }

      // Ensure arrays exist even if the model omitted them
      parsed.issues = parsed.issues ?? []
      parsed.safetyWarnings = parsed.safetyWarnings ?? []
      parsed.tableChanges = parsed.tableChanges ?? []

      return parsed
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      const isRateLimit =
        lastError.message.includes('rate_limit') ||
        lastError.message.includes('529') ||
        lastError.message.includes('overloaded')

      if (attempt === 1 && isRateLimit) {
        console.warn(`Claude API rate limited on attempt ${attempt} — retrying after ${RETRY_DELAY_MS}ms`)
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
        continue
      }

      // Non-retryable or second attempt — fall through to fallback
      break
    }
  }

  console.error('AI analysis failed after retries:', lastError?.message)
  return buildFallback(lastError?.message ?? 'unknown error', diagnostics)
}

import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer'
import type { HardwareProfile, DiagnosticResult, AIAnalysisResult } from '@/types/tuneData'

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    backgroundColor: '#0a0a0a',
    color: '#e5e5e5',
    padding: 40,
    paddingBottom: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingBottom: 10,
    borderBottom: '1 solid #333',
  },
  appName: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  subtitle: { fontSize: 8, color: '#888', marginTop: 2 },
  date: { fontSize: 8, color: '#888', textAlign: 'right' },

  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#ffffff',
    marginBottom: 6,
    paddingBottom: 4,
    borderBottom: '1 solid #333',
  },

  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  summaryBox: {
    flex: 1,
    padding: 8,
    borderRadius: 4,
    alignItems: 'center',
  },
  summaryBoxFail: { backgroundColor: '#3f1212' },
  summaryBoxWarn: { backgroundColor: '#3f2f00' },
  summaryBoxPass: { backgroundColor: '#0a2f0a' },
  summaryCount: { fontSize: 18, fontFamily: 'Helvetica-Bold' },
  summaryLabel: { fontSize: 7, color: '#aaa', marginTop: 2 },

  table: { marginBottom: 8 },
  tableRow: { flexDirection: 'row', borderBottom: '1 solid #222', paddingVertical: 4 },
  tableHeader: { backgroundColor: '#1a1a1a' },
  col1: { width: '25%', paddingRight: 8 },
  col2: { width: '35%', paddingRight: 8 },
  col3: { width: '40%' },
  colHeader: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#aaa', textTransform: 'uppercase' },
  colData: { fontSize: 8 },

  badge: { paddingHorizontal: 4, paddingVertical: 2, borderRadius: 2, fontSize: 7 },
  badgeFail: { backgroundColor: '#7f1d1d', color: '#fca5a5' },
  badgeWarn: { backgroundColor: '#78350f', color: '#fcd34d' },
  badgePass: { backgroundColor: '#14532d', color: '#86efac' },
  badgeInfo: { backgroundColor: '#1e3a5f', color: '#93c5fd' },

  paragraph: { fontSize: 8, lineHeight: 1.6, marginBottom: 8, color: '#d0d0d0' },
  bullet: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  bulletDot: { fontSize: 8, color: '#666' },
  bulletText: { fontSize: 8, flex: 1, color: '#d0d0d0', lineHeight: 1.5 },

  issueBlock: {
    marginBottom: 8,
    padding: 8,
    backgroundColor: '#111',
    borderRadius: 4,
    borderLeft: '2 solid #333',
  },
  issueTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  issueText: { fontSize: 7.5, color: '#bbb', lineHeight: 1.5, marginBottom: 3 },
  issueAction: { fontSize: 7.5, color: '#93c5fd', lineHeight: 1.5 },

  hwRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottom: '1 solid #1a1a1a' },
  hwLabel: { fontSize: 8, color: '#888' },
  hwValue: { fontSize: 8, color: '#e5e5e5', fontFamily: 'Helvetica-Bold' },

  disclaimer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    padding: 8,
    backgroundColor: '#1f1200',
    borderRadius: 4,
    borderTop: '1 solid #a16207',
  },
  disclaimerText: { fontSize: 7, color: '#ca8a04', textAlign: 'center', lineHeight: 1.4 },
  pageNumber: { position: 'absolute', bottom: 8, right: 40, fontSize: 7, color: '#666' },
})

function statusBadgeStyle(status: string) {
  if (status === 'fail') return S.badgeFail
  if (status === 'warn') return S.badgeWarn
  if (status === 'pass') return S.badgePass
  return S.badgeInfo
}

// ─── PDF Document ─────────────────────────────────────────────────────────────

interface ReportProps {
  vehicle: { osVersion?: string | null; ecuType?: string | null; platform?: string | null }
  hardware: HardwareProfile
  diagnostics: DiagnosticResult[]
  aiAnalysis: AIAnalysisResult
  generatedAt?: string
}

export function DiagnosticReportPDF({
  vehicle,
  hardware,
  diagnostics,
  aiAnalysis,
  generatedAt,
}: ReportProps) {
  const fails = diagnostics.filter((d) => d.status === 'fail')
  const warns = diagnostics.filter((d) => d.status === 'warn')
  const passes = diagnostics.filter((d) => d.status === 'pass')
  const actionItems = [...fails, ...warns]

  const disclaimerComponent = (
    <View style={S.disclaimer}>
      <Text style={S.disclaimerText}>
        ⚠️ This report is a starting point baseline only. It has not been verified on a dynamometer.
        Incorrect calibration can cause serious engine damage. Professional dyno tuning required before any WOT operation.
      </Text>
    </View>
  )

  return (
    <Document
      title="HP Tuners AI Tune Advisor — Diagnostic Report"
      author="HP Tuners AI Tune Advisor"
    >
      {/* ── Page 1: Overview ── */}
      <Page size="A4" style={S.page}>
        {/* Header */}
        <View style={S.header}>
          <View>
            <Text style={S.appName}>HP Tuners AI Tune Advisor</Text>
            <Text style={S.subtitle}>Diagnostic Report</Text>
          </View>
          <Text style={S.date}>{generatedAt ?? new Date().toLocaleDateString()}</Text>
        </View>

        {/* Summary counts */}
        <View style={S.section}>
          <Text style={S.sectionTitle}>Diagnostic Summary</Text>
          <View style={S.summaryRow}>
            <View style={[S.summaryBox, S.summaryBoxFail]}>
              <Text style={[S.summaryCount, { color: '#fca5a5' }]}>{fails.length}</Text>
              <Text style={S.summaryLabel}>CRITICAL</Text>
            </View>
            <View style={[S.summaryBox, S.summaryBoxWarn]}>
              <Text style={[S.summaryCount, { color: '#fcd34d' }]}>{warns.length}</Text>
              <Text style={S.summaryLabel}>WARNINGS</Text>
            </View>
            <View style={[S.summaryBox, S.summaryBoxPass]}>
              <Text style={[S.summaryCount, { color: '#86efac' }]}>{passes.length}</Text>
              <Text style={S.summaryLabel}>PASSED</Text>
            </View>
          </View>
        </View>

        {/* Vehicle & Hardware */}
        <View style={S.section}>
          <Text style={S.sectionTitle}>Vehicle &amp; Hardware Profile</Text>
          {[
            ['Platform', vehicle.platform ?? 'Unknown'],
            ['OS Version', vehicle.osVersion ?? 'Not detected'],
            ['ECU Type', vehicle.ecuType ?? 'Unknown'],
            ['Injector Size', hardware.injectorSize_cc ? `${hardware.injectorSize_cc.toFixed(0)} cc/min` : 'Unknown'],
            ['Forced Induction', hardware.isForcedInduction ? `Yes — ${hardware.estimatedBoostPSI?.toFixed(1) ?? '?'} PSI` : 'Naturally aspirated'],
            ['Cam Profile', hardware.camProfile],
            ['Fuel Type', hardware.fuelType],
            ['MAF Housing', hardware.MAFHousingDiameter_mm ? `${hardware.MAFHousingDiameter_mm}mm` : 'Unknown'],
          ].map(([label, value]) => (
            <View key={label} style={S.hwRow}>
              <Text style={S.hwLabel}>{label}</Text>
              <Text style={S.hwValue}>{value}</Text>
            </View>
          ))}
        </View>

        {/* AI Summary */}
        <View style={S.section}>
          <Text style={S.sectionTitle}>AI Analysis Summary</Text>
          {aiAnalysis.summary.split('\n\n').map((para, i) => (
            <Text key={i} style={S.paragraph}>{para}</Text>
          ))}
        </View>

        {disclaimerComponent}
        <Text
          style={S.pageNumber}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>

      {/* ── Page 2: Issues ── */}
      {actionItems.length > 0 && (
        <Page size="A4" style={S.page}>
          <View style={S.header}>
            <Text style={S.appName}>HP Tuners AI Tune Advisor</Text>
            <Text style={S.date}>Diagnostic Findings</Text>
          </View>

          <View style={S.section}>
            <Text style={S.sectionTitle}>Issues Requiring Attention ({actionItems.length})</Text>
            {actionItems.map((d, i) => (
              <View key={i} style={[S.issueBlock, { borderLeftColor: d.status === 'fail' ? '#7f1d1d' : '#78350f' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Text style={[S.badge, statusBadgeStyle(d.status)]}>
                    {d.status.toUpperCase()}
                  </Text>
                  <Text style={[S.issueTitle, { flex: 1 }]}>{d.check}</Text>
                  <Text style={[S.badge, { backgroundColor: '#222', color: '#888' }]}>
                    {d.system}
                  </Text>
                </View>
                <Text style={S.issueText}>{d.finding}</Text>
                <Text style={S.issueAction}>→ {d.recommendation}</Text>
              </View>
            ))}
          </View>

          {disclaimerComponent}
          <Text
            style={S.pageNumber}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
            fixed
          />
        </Page>
      )}

      {/* ── Page 3: Next Steps ── */}
      <Page size="A4" style={S.page}>
        <View style={S.header}>
          <Text style={S.appName}>HP Tuners AI Tune Advisor</Text>
          <Text style={S.date}>Action Plan</Text>
        </View>

        <View style={S.section}>
          <Text style={S.sectionTitle}>Next Steps (Priority Order)</Text>
          {aiAnalysis.nextSteps.map((step, i) => (
            <View key={i} style={S.bullet}>
              <Text style={S.bulletDot}>{i + 1}.</Text>
              <Text style={S.bulletText}>{step}</Text>
            </View>
          ))}
        </View>

        {aiAnalysis.safetyWarnings && aiAnalysis.safetyWarnings.length > 0 && (
          <View style={S.section}>
            <Text style={S.sectionTitle}>Safety Warnings</Text>
            {aiAnalysis.safetyWarnings.map((w, i) => (
              <View key={i} style={S.bullet}>
                <Text style={[S.bulletDot, { color: '#ca8a04' }]}>⚠</Text>
                <Text style={[S.bulletText, { color: '#fbbf24' }]}>{w}</Text>
              </View>
            ))}
          </View>
        )}

        {disclaimerComponent}
        <Text
          style={S.pageNumber}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  )
}

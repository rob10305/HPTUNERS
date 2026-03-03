'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { CellModification } from '@/types/tuneData'

// ─── Colour helpers ───────────────────────────────────────────────────────────

function veColour(value: number): string {
  if (value > 110) return 'bg-red-600 text-white'
  if (value > 100) return 'bg-orange-500 text-white'
  if (value > 95)  return 'bg-yellow-400 text-black'
  if (value > 85)  return 'bg-green-400 text-black'
  if (value > 70)  return 'bg-green-300 text-black'
  if (value > 50)  return 'bg-green-200 text-black'
  return 'bg-blue-200 text-black'
}

function sparkColour(value: number): string {
  if (value > 35) return 'bg-red-600 text-white'
  if (value > 28) return 'bg-orange-500 text-white'
  if (value > 20) return 'bg-yellow-400 text-black'
  if (value > 10) return 'bg-green-400 text-black'
  if (value > 0)  return 'bg-green-300 text-black'
  return 'bg-muted text-muted-foreground'
}

function modifiedCellColour(): string {
  return 'bg-blue-500 text-white ring-2 ring-blue-300'
}

// ─── Single table grid ────────────────────────────────────────────────────────

interface TableGridProps {
  table: number[][]
  tableKey: 'VE' | 'spark'
  modifiedCells?: Set<string>
  label: string
  compact?: boolean
}

function TableGrid({ table, tableKey, modifiedCells, label, compact = false }: TableGridProps) {
  const colourFn = tableKey === 'VE' ? veColour : sparkColour
  const cellSize = compact ? 'w-5 h-5 text-[8px]' : 'w-7 h-7 text-[9px]'

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="overflow-auto rounded-md border border-border p-2 bg-card/50">
        <div
          className="inline-grid gap-px"
          style={{ gridTemplateColumns: `repeat(${table[0]?.length ?? 0}, minmax(0, 1fr))` }}
        >
          {table.map((row, r) =>
            row.map((value, c) => {
              const isModified = modifiedCells?.has(`${r},${c}`) ?? false
              return (
                <div
                  key={`${r}-${c}`}
                  title={`[${r},${c}] = ${value.toFixed(2)}`}
                  className={cn(
                    'flex items-center justify-center rounded-sm font-mono',
                    cellSize,
                    isModified ? modifiedCellColour() : colourFn(value)
                  )}
                >
                  {compact ? null : value.toFixed(0)}
                </div>
              )
            })
          )}
        </div>
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        {tableKey === 'VE' ? (
          <>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-200 inline-block" /> &lt;50%</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-200 inline-block" /> 50–70%</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-400 inline-block" /> 70–95%</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-yellow-400 inline-block" /> 95–100%</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-orange-500 inline-block" /> 100–110%</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-600 inline-block" /> &gt;110%</span>
          </>
        ) : (
          <>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-300 inline-block" /> 0–10°</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-400 inline-block" /> 10–20°</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-yellow-400 inline-block" /> 20–28°</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-orange-500 inline-block" /> 28–35°</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-600 inline-block" /> &gt;35°</span>
          </>
        )}
        {modifiedCells && modifiedCells.size > 0 && (
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-500 ring-1 ring-blue-300 inline-block" /> Modified</span>
        )}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface TableViewerProps {
  originalVE?: number[][]
  originalSpark?: number[][]
  modifiedVE?: number[][]
  modifiedSpark?: number[][]
  modifications?: CellModification[]
}

export function TableViewer({
  originalVE,
  originalSpark,
  modifiedVE,
  modifiedSpark,
  modifications,
}: TableViewerProps) {
  const [activeTable, setActiveTable] = useState<'VE' | 'spark'>('VE')

  // Build modified cell index from modifications list
  const modifiedCellIndex: Record<string, Set<string>> = {}
  if (modifications) {
    for (const m of modifications) {
      if (!modifiedCellIndex[m.table]) modifiedCellIndex[m.table] = new Set()
      modifiedCellIndex[m.table].add(`${m.row},${m.col}`)
    }
  }

  const hasTurbo = !!(modifiedVE || modifiedSpark)

  const currentOriginal = activeTable === 'VE' ? originalVE : originalSpark
  const currentModified = activeTable === 'VE' ? modifiedVE : modifiedSpark

  if (!originalVE && !originalSpark) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground text-sm">
          No VE or Spark table available. Upload a CSV with these tables or a .bin file to visualise.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base">Table Visualiser</CardTitle>
          <div className="flex items-center gap-2">
            {hasTurbo && (
              <Badge variant="secondary" className="text-xs text-blue-400">
                Blue = turbo-modified cells
              </Badge>
            )}
            <div className="flex rounded-md border border-border overflow-hidden">
              {(['VE', 'spark'] as const).map((key) => {
                const hasData = key === 'VE' ? !!originalVE : !!originalSpark
                return (
                  <button
                    key={key}
                    disabled={!hasData}
                    onClick={() => setActiveTable(key)}
                    className={cn(
                      'px-3 py-1 text-xs font-medium transition-colors',
                      activeTable === key
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                      !hasData && 'opacity-40 cursor-not-allowed'
                    )}
                  >
                    {key === 'VE' ? 'VE Table' : 'Spark Table'}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {currentOriginal ? (
          hasTurbo && currentModified ? (
            // Side-by-side comparison
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <TableGrid
                table={currentOriginal}
                tableKey={activeTable}
                label="Original (NA)"
                compact={currentOriginal[0]?.length > 20}
              />
              <TableGrid
                table={currentModified}
                tableKey={activeTable}
                modifiedCells={modifiedCellIndex[activeTable]}
                label="Modified (Turbo baseline)"
                compact={currentModified[0]?.length > 20}
              />
            </div>
          ) : (
            <TableGrid
              table={currentOriginal}
              tableKey={activeTable}
              label={`${activeTable} Table — ${currentOriginal.length} rows × ${currentOriginal[0]?.length ?? 0} cols`}
              compact={currentOriginal[0]?.length > 20}
            />
          )
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">
            {activeTable} table not available in this upload.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

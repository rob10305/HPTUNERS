'use client'

import { X, CheckCircle2, AlertCircle, Loader2, FileText, Binary, Activity } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { UploadedFile } from '@/types/tuneData'

const CSV_LABELS = [
  'VE Table',
  'Spark Table',
  'MAF Table',
  'WOT AFR',
  'IAT Correction',
  'Injector Flow',
  'Boost Target',
  'Wastegate DC',
  'Other',
]

interface FileQueueProps {
  files: UploadedFile[]
  onRemove: (id: string) => void
  onLabelChange?: (id: string, label: string) => void
  showLabels?: boolean
}

function FileIcon({ type }: { type: UploadedFile['type'] }) {
  if (type === 'bin') return <Binary className="w-4 h-4 text-blue-400" />
  if (type === 'hpl') return <Activity className="w-4 h-4 text-green-400" />
  return <FileText className="w-4 h-4 text-yellow-400" />
}

function StatusIcon({ status }: { status: UploadedFile['status'] }) {
  if (status === 'done') return <CheckCircle2 className="w-4 h-4 text-green-500" />
  if (status === 'error') return <AlertCircle className="w-4 h-4 text-destructive" />
  if (status === 'uploading' || status === 'processing')
    return <Loader2 className="w-4 h-4 text-primary animate-spin" />
  return null
}

function statusLabel(status: UploadedFile['status']): string {
  const map: Record<UploadedFile['status'], string> = {
    pending: 'pending',
    uploading: 'uploading',
    processing: 'processing',
    done: 'ready',
    error: 'error',
  }
  return map[status]
}

function statusVariant(status: UploadedFile['status']): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'done') return 'default'
  if (status === 'error') return 'destructive'
  return 'secondary'
}

export function FileQueue({ files, onRemove, onLabelChange, showLabels = false }: FileQueueProps) {
  if (files.length === 0) return null

  return (
    <div className="mt-4 space-y-2">
      {files.map((f) => (
        <div
          key={f.id}
          className={cn(
            'flex flex-col gap-2 p-3 rounded-lg border bg-card',
            f.status === 'error' ? 'border-destructive/50' : 'border-border'
          )}
        >
          <div className="flex items-center gap-3">
            <FileIcon type={f.type} />
            <span className="flex-1 text-sm font-medium truncate">{f.name}</span>
            <StatusIcon status={f.status} />
            <Badge variant={statusVariant(f.status)} className="text-xs capitalize">
              {statusLabel(f.status)}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={() => onRemove(f.id)}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>

          {showLabels && onLabelChange && f.type === 'csv' && (
            <select
              className="w-full text-xs rounded-md border border-input bg-background px-2 py-1.5 text-foreground"
              value={f.label || ''}
              onChange={(e) => onLabelChange(f.id, e.target.value)}
            >
              <option value="">— Select table type —</option>
              {CSV_LABELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          )}

          {(f.status === 'uploading' || f.status === 'processing') && (
            <Progress value={f.progress} className="h-1" />
          )}

          {f.error && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {f.error}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

'use client'

import { useState, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { UploadZone } from './UploadZone'
import { FileQueue } from './FileQueue'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'
import type { UploadedFile } from '@/types/tuneData'

// ─── CSV Upload Panel ────────────────────────────────────────────────────────

interface CSVUploadPanelProps {
  onReady: (files: UploadedFile[]) => void
}

export function CSVUploadPanel({ onReady }: CSVUploadPanelProps) {
  const [files, setFiles] = useState<UploadedFile[]>([])

  const handleAdd = useCallback((rawFiles: File[]) => {
    const newFiles: UploadedFile[] = rawFiles.map((f) => ({
      id: uuidv4(),
      file: f,
      name: f.name,
      type: 'csv',
      status: 'pending',
      progress: 0,
    }))
    setFiles((prev) => [...prev, ...newFiles])
  }, [])

  const handleRemove = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }, [])

  const handleLabelChange = useCallback((id: string, label: string) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, label } : f)))
  }, [])

  const allLabelled = files.length > 0 && files.every((f) => f.label)

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Export individual tables from HP Tuners VCM Editor as CSV and upload them here. Label each
        file so the parser knows what it contains.
      </p>
      <UploadZone
        accept={['.csv']}
        multiple
        onFilesSelected={handleAdd}
        label="Drop CSV table files here"
        sublabel="You can add multiple files — label each one below"
      />
      <FileQueue
        files={files}
        onRemove={handleRemove}
        onLabelChange={handleLabelChange}
        showLabels
      />
      {files.length > 0 && (
        <div className="flex items-center justify-between pt-2">
          {!allLabelled && (
            <p className="text-xs text-muted-foreground">Label all files to continue</p>
          )}
          <Button
            className="ml-auto"
            disabled={!allLabelled}
            onClick={() => onReady(files)}
          >
            Continue <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── BIN Upload Panel ────────────────────────────────────────────────────────

interface BINUploadPanelProps {
  onReady: (files: UploadedFile[]) => void
}

export function BINUploadPanel({ onReady }: BINUploadPanelProps) {
  const [file, setFile] = useState<UploadedFile | null>(null)

  const handleAdd = useCallback((rawFiles: File[]) => {
    const f = rawFiles[0]
    setFile({
      id: uuidv4(),
      file: f,
      name: f.name,
      type: 'bin',
      status: 'pending',
      progress: 0,
    })
  }, [])

  const handleRemove = useCallback(() => {
    setFile(null)
  }, [])

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Upload a raw PCM binary file (.bin). The parser will attempt to identify the OS version and
        extract known tables automatically. Supported platforms: GM LS1, GM LS3.
      </p>
      <UploadZone
        accept={['.bin']}
        onFilesSelected={handleAdd}
        label="Drop your .bin PCM file here"
        sublabel="GM LS1 / LS3 — single file only"
      />
      {file && (
        <>
          <FileQueue files={[file]} onRemove={handleRemove} />
          <div className="flex justify-end pt-2">
            <Button onClick={() => onReady([file])}>
              Continue <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── HPL Upload Panel ────────────────────────────────────────────────────────

interface HPLUploadPanelProps {
  onReady: (files: UploadedFile[]) => void
}

export function HPLUploadPanel({ onReady }: HPLUploadPanelProps) {
  const [file, setFile] = useState<UploadedFile | null>(null)

  const handleAdd = useCallback((rawFiles: File[]) => {
    const f = rawFiles[0]
    setFile({
      id: uuidv4(),
      file: f,
      name: f.name,
      type: 'hpl',
      status: 'pending',
      progress: 0,
    })
  }, [])

  const handleRemove = useCallback(() => {
    setFile(null)
  }, [])

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Upload a VCM Scanner datalog file (.hpl). The parser extracts RPM, TPS, MAP, MAF, STFT,
        LTFT, O2/Lambda, knock retard, IAT, coolant temperature, and boost channels.
      </p>
      <UploadZone
        accept={['.hpl']}
        onFilesSelected={handleAdd}
        label="Drop your .hpl datalog file here"
        sublabel="VCM Scanner datalog — single file only"
      />
      {file && (
        <>
          <FileQueue files={[file]} onRemove={handleRemove} />
          <div className="flex justify-end pt-2">
            <Button onClick={() => onReady([file])}>
              Continue <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

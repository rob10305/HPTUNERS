'use client'

import { useCallback, useState } from 'react'
import { Upload, FileUp, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface UploadZoneProps {
  accept: string[]
  multiple?: boolean
  onFilesSelected: (files: File[]) => void
  label: string
  sublabel?: string
  disabled?: boolean
  className?: string
}

export function UploadZone({
  accept,
  multiple = false,
  onFilesSelected,
  label,
  sublabel,
  disabled = false,
  className,
}: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  const handleFiles = useCallback(
    (files: File[]) => {
      if (disabled) return
      setValidationError(null)
      const valid = files.filter((f) => {
        const ext = '.' + f.name.split('.').pop()?.toLowerCase()
        return accept.includes(ext)
      })
      if (valid.length === 0) {
        setValidationError(`Invalid file type. Expected: ${accept.join(', ')}`)
        return
      }
      const toUse = !multiple && valid.length > 1 ? [valid[0]] : valid
      onFilesSelected(toUse)
    },
    [disabled, accept, multiple, onFilesSelected]
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const files = Array.from(e.dataTransfer.files)
      handleFiles(files)
    },
    [handleFiles]
  )

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const onDragLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || [])
      handleFiles(files)
      // Reset input so same file can be re-selected
      e.target.value = ''
    },
    [handleFiles]
  )

  return (
    <div className={cn('relative', className)}>
      <label
        className={cn(
          'flex flex-col items-center justify-center w-full min-h-[160px] rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200',
          'bg-card hover:bg-accent/30',
          isDragging
            ? 'border-primary bg-primary/10 scale-[1.01]'
            : 'border-border hover:border-primary/50',
          disabled && 'opacity-50 cursor-not-allowed pointer-events-none'
        )}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        <input
          type="file"
          className="sr-only"
          accept={accept.join(',')}
          multiple={multiple}
          onChange={onInputChange}
          disabled={disabled}
        />
        <div className="flex flex-col items-center gap-2 p-6 text-center pointer-events-none">
          {isDragging ? (
            <FileUp className="w-10 h-10 text-primary animate-bounce" />
          ) : (
            <Upload className="w-10 h-10 text-muted-foreground" />
          )}
          <span className="text-sm font-medium text-foreground">{label}</span>
          {sublabel && (
            <span className="text-xs text-muted-foreground">{sublabel}</span>
          )}
          <span className="text-xs text-muted-foreground/70 mt-1">
            {accept.join(', ')} &nbsp;·&nbsp; {isDragging ? 'Drop to upload' : 'Click or drag & drop'}
          </span>
        </div>
      </label>

      {validationError && (
        <div className="flex items-center gap-2 mt-2 text-destructive text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{validationError}</span>
        </div>
      )}
    </div>
  )
}

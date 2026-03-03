'use client'

import { useState } from 'react'
import { ArrowLeft, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { TurboConversionInputs } from '@/types/tuneData'

interface TurboInputsFormProps {
  onBack: () => void
  onStart: (inputs: TurboConversionInputs) => void
}

type FormValues = {
  targetWHP: string
  turboPSI: string
  newInjector_cc: string
  fuelType: 'pump91' | 'E30' | 'E85'
  hasIntercooler: boolean
  turboSpoolRPM: string
}

type FormErrors = Partial<Record<keyof FormValues, string>>

export function TurboInputsForm({ onBack, onStart }: TurboInputsFormProps) {
  const [values, setValues] = useState<FormValues>({
    targetWHP: '',
    turboPSI: '',
    newInjector_cc: '',
    fuelType: 'pump91',
    hasIntercooler: true,
    turboSpoolRPM: '3000',
  })
  const [errors, setErrors] = useState<FormErrors>({})

  const set = <K extends keyof FormValues>(key: K, val: FormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: val }))

  const validate = (): boolean => {
    const newErrors: FormErrors = {}
    const targetWHP = Number(values.targetWHP)
    const turboPSI = Number(values.turboPSI)
    const injector = Number(values.newInjector_cc)
    const spoolRPM = Number(values.turboSpoolRPM)

    if (!values.targetWHP || isNaN(targetWHP) || targetWHP < 100 || targetWHP > 2000) {
      newErrors.targetWHP = '100 – 2000 WHP'
    }
    if (!values.turboPSI || isNaN(turboPSI) || turboPSI < 1 || turboPSI > 50) {
      newErrors.turboPSI = '1 – 50 PSI'
    }
    if (!values.newInjector_cc || isNaN(injector) || injector < 200 || injector > 2500) {
      newErrors.newInjector_cc = '200 – 2500 cc/min'
    }
    if (!values.turboSpoolRPM || isNaN(spoolRPM) || spoolRPM < 1000 || spoolRPM > 6000) {
      newErrors.turboSpoolRPM = '1000 – 6000 RPM'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleStart = () => {
    if (!validate()) return
    onStart({
      targetWHP: Number(values.targetWHP),
      turboPSI: Number(values.turboPSI),
      newInjector_cc: Number(values.newInjector_cc),
      fuelType: values.fuelType,
      hasIntercooler: values.hasIntercooler,
      turboSpoolRPM: Number(values.turboSpoolRPM),
    })
  }

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Title */}
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight">Turbo conversion details</h2>
          <p className="text-sm text-muted-foreground mt-1">
            These values are used to generate your baseline maps
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-blue-400" />
              Hardware specifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* Row 1: WHP + PSI */}
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Target WHP"
                unit="whp"
                placeholder="e.g. 400"
                value={values.targetWHP}
                error={errors.targetWHP}
                onChange={(v) => set('targetWHP', v)}
              />
              <Field
                label="Boost pressure"
                unit="PSI"
                placeholder="e.g. 8"
                value={values.turboPSI}
                error={errors.turboPSI}
                onChange={(v) => set('turboPSI', v)}
              />
            </div>

            {/* Row 2: Injector + Spool RPM */}
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Injector size"
                unit="cc/min"
                placeholder="e.g. 850"
                value={values.newInjector_cc}
                error={errors.newInjector_cc}
                onChange={(v) => set('newInjector_cc', v)}
              />
              <Field
                label="Turbo spool RPM"
                unit="RPM"
                placeholder="e.g. 3000"
                value={values.turboSpoolRPM}
                error={errors.turboSpoolRPM}
                onChange={(v) => set('turboSpoolRPM', v)}
              />
            </div>

            {/* Fuel type */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Fuel type
              </label>
              <select
                value={values.fuelType}
                onChange={(e) =>
                  set('fuelType', e.target.value as 'pump91' | 'E30' | 'E85')
                }
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="pump91">Pump 91 (gasoline)</option>
                <option value="E30">E30 (30% ethanol blend)</option>
                <option value="E85">E85 (flex fuel)</option>
              </select>
            </div>

            {/* Intercooler */}
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={values.hasIntercooler}
                onChange={(e) => set('hasIntercooler', e.target.checked)}
                className="w-4 h-4 rounded border-input accent-primary"
              />
              <div>
                <p className="text-sm font-medium">Front-mount intercooler fitted</p>
                <p className="text-xs text-muted-foreground">
                  Affects IAT correction table generation
                </p>
              </div>
            </label>

          </CardContent>
        </Card>

        {/* Info note */}
        <div className="p-3 rounded-lg border border-blue-500/30 bg-blue-500/5">
          <p className="text-xs text-blue-400/90 leading-relaxed">
            These values generate a <strong>safe conservative baseline only</strong>. All
            outputs require dyno verification and professional tuning before wide-open-throttle
            operation.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <Button className="flex-1 gap-2" onClick={handleStart}>
            <Zap className="w-4 h-4" />
            Start analysis
          </Button>
        </div>
      </div>
    </main>
  )
}

// ─── Field helper ─────────────────────────────────────────────────────────────

interface FieldProps {
  label: string
  unit: string
  placeholder: string
  value: string
  error?: string
  onChange: (v: string) => void
}

function Field({ label, unit, placeholder, value, error, onChange }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground">
        {label}{' '}
        <span className="text-muted-foreground font-normal">({unit})</span>
      </label>
      <input
        type="number"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'w-full h-9 rounded-md border bg-background px-3 text-sm text-foreground',
          'focus:outline-none focus:ring-1',
          error
            ? 'border-destructive focus:ring-destructive'
            : 'border-input focus:ring-ring'
        )}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

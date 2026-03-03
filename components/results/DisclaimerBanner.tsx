'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const DISCLAIMER_TEXT =
  '⚠️ This output is a starting point baseline only. It has not been verified on a dynamometer. Incorrect calibration can cause serious engine damage. Always monitor wideband O2 and knock activity. Professional dyno tuning is required before any wide-open-throttle operation.'

const ACK_KEY = 'disclaimer_ack'

interface DisclaimerBannerProps {
  className?: string
}

export function DisclaimerBanner({ className }: DisclaimerBannerProps) {
  // Start closed to avoid hydration mismatch — open in useEffect once we can
  // check localStorage. This prevents the modal from flashing on return visits.
  const [mounted, setMounted] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)

  useEffect(() => {
    setMounted(true)
    if (!localStorage.getItem(ACK_KEY)) {
      setModalOpen(true)
    }
  }, [])

  const handleClose = () => {
    localStorage.setItem(ACK_KEY, '1')
    setModalOpen(false)
  }

  return (
    <>
      {/* Persistent banner — always visible at top of results */}
      <div
        className={cn(
          'flex items-start gap-3 p-4 rounded-lg border border-yellow-500/40 bg-yellow-500/5',
          className
        )}
      >
        <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-yellow-500/90 leading-relaxed">{DISCLAIMER_TEXT}</p>
      </div>

      {/* Acknowledgement modal — only rendered client-side to avoid hydration issues */}
      {mounted && modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-yellow-500/40 bg-card shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 p-5 border-b border-border bg-yellow-500/5">
              <AlertTriangle className="w-6 h-6 text-yellow-500 flex-shrink-0" />
              <h2 className="text-base font-bold text-yellow-500">Safety Notice — Please Read</h2>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              <p className="text-sm leading-relaxed text-foreground/90">
                {DISCLAIMER_TEXT}
              </p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <span className="text-yellow-500 flex-shrink-0">•</span>
                  Any table values generated here are{' '}
                  <strong className="text-foreground">starting point estimates</strong>, not final
                  calibration values.
                </li>
                <li className="flex gap-2">
                  <span className="text-yellow-500 flex-shrink-0">•</span>
                  You are solely responsible for verifying all outputs before use in a vehicle.
                </li>
                <li className="flex gap-2">
                  <span className="text-yellow-500 flex-shrink-0">•</span>
                  Do not operate at wide-open throttle without professional dyno verification.
                </li>
              </ul>

              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="mt-0.5 w-4 h-4 rounded"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                />
                <span className="text-sm">
                  I understand that this output requires professional verification and I accept
                  full responsibility for its use.
                </span>
              </label>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 p-5 border-t border-border">
              <Button
                disabled={!acknowledged}
                onClick={handleClose}
                className="gap-2"
              >
                <X className="w-4 h-4" />
                Continue to results
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

import * as React from 'react'
import { cn } from '../../lib/utils'

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number
  /** When true, show an indeterminate bar (e.g. download with unknown total size). */
  indeterminate?: boolean
}

function Progress({ className, value = 0, indeterminate = false, ...props }: ProgressProps) {
  if (indeterminate) {
    return (
      <div
        className={cn('relative h-2 w-full overflow-hidden rounded-full bg-secondary', className)}
        {...props}
      >
        <div className="h-full w-full origin-left animate-pulse bg-primary/70" />
      </div>
    )
  }
  return (
    <div
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-secondary', className)}
      {...props}
    >
      <div
        className="h-full bg-primary transition-all duration-300"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

export { Progress }

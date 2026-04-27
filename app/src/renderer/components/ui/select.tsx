import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

/** Stretch to parent (chevron at field edge). Otherwise shrink-wrap to select width (e.g. w-48). */
function selectWrapperLayoutClass(className?: string): string {
  const c = className ?? ''
  if (/\bflex-1\b/.test(c) || /\bw-full\b/.test(c)) {
    return 'relative flex w-full min-w-0'
  }
  return 'relative inline-flex max-w-full align-top'
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className, ...props }, ref) => (
  <div className={selectWrapperLayoutClass(className)}>
    <select
      ref={ref}
      className={cn(
        // `appearance-none` removes the native chevron — show one explicitly on the right.
        'peer flex h-9 w-full appearance-none rounded-md border border-input bg-background px-3 py-1 pr-9 text-sm text-foreground shadow-sm [color-scheme:dark] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
    <ChevronDown
      className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground peer-disabled:opacity-40"
      aria-hidden
    />
  </div>
))
Select.displayName = 'Select'

export { Select }

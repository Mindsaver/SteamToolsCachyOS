import React, { useEffect, useRef } from 'react'
import { cn } from '../lib/utils'
export interface LogStreamLine {
  type: 'log' | 'progress' | 'done' | 'error'
  message: string
  current?: number
  total?: number
}

interface LogStreamProps {
  lines: LogStreamLine[]
  className?: string
}

export function LogStream({ lines, className }: LogStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  return (
    <div
      className={cn(
        'h-full overflow-y-auto rounded-lg border border-border bg-black/30 p-3 font-mono text-xs',
        className
      )}
      data-selectable
    >
      {lines.length === 0 && (
        <span className="text-muted-foreground">Output will appear here…</span>
      )}
      {lines.map((line, i) => (
        <div
          key={i}
          className={cn(
            'leading-5 whitespace-pre-wrap break-all',
            line.type === 'error' && 'text-destructive',
            line.type === 'done' && 'text-green-400 font-semibold',
            line.type === 'log' && 'text-muted-foreground',
            line.type === 'progress' && 'text-foreground'
          )}
        >
          {line.message}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}

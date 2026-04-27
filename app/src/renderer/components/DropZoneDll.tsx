import React, { useState, useRef } from 'react'
import { Upload, FileDown } from 'lucide-react'
import { cn } from '../lib/utils'
import { Button } from './ui/button'
import { api } from '../lib/ipc'

interface DropZoneDllProps {
  onFileSelected: (path: string) => void
}

export function DropZoneDll({ onFileSelected }: DropZoneDllProps) {
  const [dragging, setDragging] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }
  const handleDragLeave = () => setDragging(false)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && file.name.toLowerCase().endsWith('.dll')) {
      onFileSelected(file.path)
    }
  }

  const handleBrowse = async () => {
    const path = await api.openFileDialog([{ name: 'DLL files', extensions: ['dll'] }])
    if (path) onFileSelected(path)
  }

  return (
    <div
      ref={dropRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-colors',
        dragging
          ? 'border-primary bg-primary/10'
          : 'border-border bg-card hover:border-primary/50 hover:bg-muted/10'
      )}
    >
      {dragging ? (
        <FileDown className="h-10 w-10 text-primary" />
      ) : (
        <Upload className="h-10 w-10 text-muted-foreground" />
      )}
      <div className="text-center">
        <p className="font-medium">{dragging ? 'Drop to select' : 'Drop amdxcffx64.dll here'}</p>
        <p className="text-sm text-muted-foreground mt-1">or browse to locate the file</p>
      </div>
      <Button variant="outline" size="sm" onClick={handleBrowse}>
        Browse…
      </Button>
    </div>
  )
}

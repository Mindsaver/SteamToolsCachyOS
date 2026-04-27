import React, { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { api } from '../lib/ipc'

const REPO_URL = 'https://github.com/Mindsaver/SteamToolsCachyOS'

export function AboutDialog(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [info, setInfo] = useState<{ name: string; version: string } | null>(null)

  useEffect(() => {
    if (!props.open) return
    void api.getAboutInfo().then(setInfo)
  }, [props.open])

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        className="max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>{info?.name ?? 'SteamToolsCachyOS'}</DialogTitle>
          <DialogDescription className="space-y-2 pt-1">
            <span className="block text-foreground font-mono text-sm">
              Version {info?.version ?? '…'}
            </span>
            <span className="block">
              Steam toolkit for CachyOS and other Linux distros — symlink hub, FSR DLL helper, launch options.
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void api.openExternalUrl(REPO_URL)}
          >
            GitHub
          </Button>
          <Button type="button" onClick={() => props.onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

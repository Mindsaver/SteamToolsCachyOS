import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { Select } from '../ui/select'
import type { MongoConnectionProfile } from '../../../shared/types'

interface Props {
  connections: MongoConnectionProfile[]
  connectionId: string
  collection: string
  query: string
  projection: string
  limit: number
  onChangeConnection: (id: string) => void
  onChangeQuery: (next: { collection: string; query: string; projection: string; limit: number }) => void
  onRun: () => void
  rows: Record<string, unknown>[]
}

export function DataPreviewPanel(props: Props) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Mongo data preview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Select value={props.connectionId} onChange={(e) => props.onChangeConnection(e.target.value)}>
          <option value="">Choose connection…</option>
          {props.connections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.database})
            </option>
          ))}
        </Select>
        <Input
          value={props.collection}
          onChange={(e) =>
            props.onChangeQuery({
              collection: e.target.value,
              query: props.query,
              projection: props.projection,
              limit: props.limit,
            })
          }
          placeholder="Collection"
        />
        <Textarea
          value={props.query}
          onChange={(e) =>
            props.onChangeQuery({
              collection: props.collection,
              query: e.target.value,
              projection: props.projection,
              limit: props.limit,
            })
          }
          className="font-mono text-xs min-h-16"
          placeholder='{"game":"example"}'
        />
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={props.projection}
            onChange={(e) =>
              props.onChangeQuery({
                collection: props.collection,
                query: props.query,
                projection: e.target.value,
                limit: props.limit,
              })
            }
            className="font-mono text-xs"
            placeholder='{"fps":1}'
          />
          <Input
            value={String(props.limit)}
            onChange={(e) =>
              props.onChangeQuery({
                collection: props.collection,
                query: props.query,
                projection: props.projection,
                limit: Number(e.target.value) || 20,
              })
            }
            placeholder="Limit"
          />
        </div>
        <Button size="sm" onClick={props.onRun}>
          Run preview query
        </Button>
        <pre className="rounded-md border border-border bg-muted/40 p-2 text-[11px] overflow-auto max-h-52">
          {JSON.stringify(props.rows.slice(0, 3), null, 2)}
        </pre>
      </CardContent>
    </Card>
  )
}

import type { HudDocument, HudTheme, HudWidget, HudWidgetKind } from '../../../shared/types'

export interface EditorState {
  doc: HudDocument
  selectedIds: string[]
}

export type EditorAction =
  | { type: 'set_doc'; doc: HudDocument }
  | { type: 'select_widget'; widgetId: string | null; additive?: boolean }
  | { type: 'add_widget'; kind: HudWidgetKind }
  | { type: 'update_widget_position'; widgetId: string; x: number; y: number }
  | { type: 'update_widget_size'; widgetId: string; w: number; h: number }
  | { type: 'update_widget_title'; widgetId: string; title: string }
  | { type: 'update_widget_style'; widgetId: string; patch: Partial<HudWidget['style']> }
  | { type: 'remove_selected' }
  | { type: 'set_theme'; theme: Partial<HudTheme> }
  | { type: 'set_binding'; widgetId: string; key: string; mode: 'static' | 'field'; value: string }
  | { type: 'set_query'; collection: string; query: string; projection: string; limit: number }

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

export function createEmptyDocument(): HudDocument {
  const now = Date.now()
  return {
    id: '',
    name: 'Untitled HUD',
    connectionId: null,
    collection: null,
    query: '{}',
    projection: '{}',
    limit: 20,
    layout: {
      width: 1920,
      height: 1080,
      gridSize: 8,
    },
    theme: {
      name: 'Midnight Pro',
      background: '#0b1020',
      foreground: '#e5e7eb',
      accent: '#22d3ee',
      surface: '#111827',
      fontFamily: 'Inter, system-ui, sans-serif',
    },
    widgets: [],
    createdAt: now,
    updatedAt: now,
  }
}

function defaultWidget(kind: HudWidgetKind, idx: number): HudWidget {
  return {
    id: makeId('w'),
    kind,
    x: 32 + idx * 28,
    y: 32 + idx * 20,
    w: kind === 'panel' ? 300 : 220,
    h: kind === 'bar' ? 46 : 90,
    title: kind.replace('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase()),
    style: {
      color: '#e5e7eb',
      backgroundColor: '#111827',
      borderColor: '#374151',
      borderWidth: 1,
      borderRadius: 12,
      fontSize: 14,
      fontWeight: 600,
      opacity: 1,
      padding: 12,
      shadow: '0 6px 18px rgba(0,0,0,0.35)',
    },
    bindings: {
      value: { mode: 'static', staticValue: kind === 'bar' ? 72 : `${kind} value` },
    },
  }
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'set_doc':
      return { doc: action.doc, selectedIds: [] }
    case 'select_widget': {
      if (!action.widgetId) return { ...state, selectedIds: [] }
      if (action.additive) {
        const exists = state.selectedIds.includes(action.widgetId)
        return {
          ...state,
          selectedIds: exists
            ? state.selectedIds.filter((id) => id !== action.widgetId)
            : [...state.selectedIds, action.widgetId],
        }
      }
      return { ...state, selectedIds: [action.widgetId] }
    }
    case 'add_widget': {
      const widget = defaultWidget(action.kind, state.doc.widgets.length)
      return {
        ...state,
        selectedIds: [widget.id],
        doc: {
          ...state.doc,
          updatedAt: Date.now(),
          widgets: [...state.doc.widgets, widget],
        },
      }
    }
    case 'update_widget_position':
      return {
        ...state,
        doc: {
          ...state.doc,
          updatedAt: Date.now(),
          widgets: state.doc.widgets.map((w) => (w.id === action.widgetId ? { ...w, x: action.x, y: action.y } : w)),
        },
      }
    case 'update_widget_size':
      return {
        ...state,
        doc: {
          ...state.doc,
          updatedAt: Date.now(),
          widgets: state.doc.widgets.map((w) =>
            w.id === action.widgetId ? { ...w, w: Math.max(40, action.w), h: Math.max(24, action.h) } : w
          ),
        },
      }
    case 'update_widget_title':
      return {
        ...state,
        doc: {
          ...state.doc,
          updatedAt: Date.now(),
          widgets: state.doc.widgets.map((w) => (w.id === action.widgetId ? { ...w, title: action.title } : w)),
        },
      }
    case 'update_widget_style':
      return {
        ...state,
        doc: {
          ...state.doc,
          updatedAt: Date.now(),
          widgets: state.doc.widgets.map((w) =>
            w.id === action.widgetId ? { ...w, style: { ...w.style, ...action.patch } } : w
          ),
        },
      }
    case 'remove_selected':
      return {
        ...state,
        selectedIds: [],
        doc: {
          ...state.doc,
          updatedAt: Date.now(),
          widgets: state.doc.widgets.filter((w) => !state.selectedIds.includes(w.id)),
        },
      }
    case 'set_theme':
      return {
        ...state,
        doc: { ...state.doc, updatedAt: Date.now(), theme: { ...state.doc.theme, ...action.theme } },
      }
    case 'set_binding':
      return {
        ...state,
        doc: {
          ...state.doc,
          updatedAt: Date.now(),
          widgets: state.doc.widgets.map((w) =>
            w.id === action.widgetId
              ? {
                  ...w,
                  bindings: {
                    ...w.bindings,
                    [action.key]:
                      action.mode === 'field'
                        ? { mode: 'field', fieldPath: action.value }
                        : { mode: 'static', staticValue: action.value },
                  },
                }
              : w
          ),
        },
      }
    case 'set_query':
      return {
        ...state,
        doc: {
          ...state.doc,
          collection: action.collection || null,
          query: action.query,
          projection: action.projection,
          limit: action.limit,
          updatedAt: Date.now(),
        },
      }
    default:
      return state
  }
}

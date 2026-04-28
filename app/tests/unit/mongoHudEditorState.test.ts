import { describe, expect, it } from 'vitest'
import { createEmptyDocument, editorReducer, type EditorState } from '../../src/renderer/components/mongoHud/editorState'

function baseState(): EditorState {
  return { doc: createEmptyDocument(), selectedIds: [] }
}

describe('mongoHud editor reducer', () => {
  it('adds widgets and selects the new one', () => {
    const state = editorReducer(baseState(), { type: 'add_widget', kind: 'text' })
    expect(state.doc.widgets).toHaveLength(1)
    expect(state.selectedIds).toHaveLength(1)
    expect(state.doc.widgets[0].id).toBe(state.selectedIds[0])
  })

  it('updates widget style and title', () => {
    const withWidget = editorReducer(baseState(), { type: 'add_widget', kind: 'bar' })
    const id = withWidget.doc.widgets[0].id
    const withTitle = editorReducer(withWidget, { type: 'update_widget_title', widgetId: id, title: 'FPS meter' })
    const withStyle = editorReducer(withTitle, {
      type: 'update_widget_style',
      widgetId: id,
      patch: { color: '#00ff00', fontSize: 20 },
    })
    expect(withStyle.doc.widgets[0].title).toBe('FPS meter')
    expect(withStyle.doc.widgets[0].style.color).toBe('#00ff00')
    expect(withStyle.doc.widgets[0].style.fontSize).toBe(20)
  })

  it('supports field binding for widget values', () => {
    const withWidget = editorReducer(baseState(), { type: 'add_widget', kind: 'stat_card' })
    const id = withWidget.doc.widgets[0].id
    const next = editorReducer(withWidget, {
      type: 'set_binding',
      widgetId: id,
      key: 'value',
      mode: 'field',
      value: 'stats.fps',
    })
    expect(next.doc.widgets[0].bindings.value?.mode).toBe('field')
    expect(next.doc.widgets[0].bindings.value?.fieldPath).toBe('stats.fps')
  })

  it('removes selected widget', () => {
    const first = editorReducer(baseState(), { type: 'add_widget', kind: 'text' })
    const second = editorReducer(first, { type: 'add_widget', kind: 'icon' })
    const selected = editorReducer(second, { type: 'select_widget', widgetId: second.doc.widgets[0].id })
    const removed = editorReducer(selected, { type: 'remove_selected' })
    expect(removed.doc.widgets).toHaveLength(1)
  })
})

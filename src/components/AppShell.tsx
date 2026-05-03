import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useProjectStore } from '../stores/projectStore'
import { TopPane } from './TopPane'
import { BottomPane } from './BottomPane'
import { FileMenu } from './FileMenu'
import { AutoRegenerator } from './AutoRegenerator'
import './AppShell.css'

const MIN_PANE_PX = 120

export function AppShell() {
  const isDirty = useProjectStore(s => s.isDirty)
  const filePath = useProjectStore(s => s.filePath)
  const diagnostics = useProjectStore(s => s.parseResult.diagnostics)

  const mainRef = useRef<HTMLElement>(null)
  const [topBasis, setTopBasis] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => {
      const main = mainRef.current
      if (!main) return
      const rect = main.getBoundingClientRect()
      const offset = e.clientY - rect.top
      const max = rect.height - MIN_PANE_PX
      const next = Math.max(MIN_PANE_PX, Math.min(max, offset))
      setTopBasis(`${next}px`)
    }
    const onUp = () => setDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging])

  const mainStyle = topBasis
    ? ({ '--top-pane-basis': topBasis } as CSSProperties)
    : undefined

  return (
    <div className="app">
      <AutoRegenerator />
      <header className="app__header">
        <h1 className="app__title">NeoCombi</h1>
        <span className="app__subtitle">Combinatorial test design tool</span>
        <FileMenu />
        <span className="app__filepath">
          {filePath ?? '(unsaved project)'}
          {isDirty ? ' •' : ''}
        </span>
      </header>

      <main className="app__main" ref={mainRef} style={mainStyle}>
        <TopPane />
        <div
          className={`app__divider${dragging ? ' app__divider--dragging' : ''}`}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize panes"
          onMouseDown={e => {
            e.preventDefault()
            setDragging(true)
          }}
          onDoubleClick={() => setTopBasis(null)}
          title="Drag to resize · double-click to reset"
        />
        <BottomPane />
      </main>

      <footer className="app__footer">
        <span>
          {diagnostics.length === 0
            ? 'DSL: OK'
            : `DSL: ${diagnostics.length} ${diagnostics.length === 1 ? 'issue' : 'issues'}`}
        </span>
        <span className="app__footer-spacer" />
        <span>v0.1 preview</span>
      </footer>
    </div>
  )
}

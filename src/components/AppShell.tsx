import { useProjectStore } from '../stores/projectStore'
import { TopPane } from './TopPane'
import { BottomPane } from './BottomPane'
import { FileMenu } from './FileMenu'
import './AppShell.css'

export function AppShell() {
  const isDirty = useProjectStore(s => s.isDirty)
  const filePath = useProjectStore(s => s.filePath)
  const diagnostics = useProjectStore(s => s.parseResult.diagnostics)

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">NeoCombi</h1>
        <span className="app__subtitle">Combinatorial test design tool</span>
        <FileMenu />
        <span className="app__filepath">
          {filePath ?? '(unsaved project)'}
          {isDirty ? ' •' : ''}
        </span>
      </header>

      <main className="app__main">
        <TopPane />
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

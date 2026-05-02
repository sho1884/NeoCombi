import './App.css'

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>NeoCombi</h1>
        <p className="subtitle">
          Combinatorial test design tool — bootstrap scaffold
        </p>
      </header>

      <main className="app-main">
        <section className="top-pane" aria-label="Top pane: visualization">
          <h2>Top pane</h2>
          <p>
            Exhaustive cross-tabulation matrix and forbidden-combination
            reference views will live here (SR-030..033, SR-040..043).
          </p>
        </section>

        <section className="bottom-pane" aria-label="Bottom pane: authoring">
          <h2>Bottom pane</h2>
          <p>
            Tabbed authoring area: Factors &amp; Levels / DSL / Test cases
            (SR-020). A &ldquo;Natural-language requirements&rdquo; tab is
            added in v2 when AI integration is enabled (UR-007).
          </p>
        </section>
      </main>

      <footer className="app-footer">
        <small>
          Status: scaffold only — implementation tracks UR-001..006 in MVP.
          See <code>Doc/requirements/Requirements_Specification.md</code>.
        </small>
      </footer>
    </div>
  )
}

export default App

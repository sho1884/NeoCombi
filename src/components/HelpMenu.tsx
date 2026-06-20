import { useEffect, useRef, useState } from 'react'
import { DSL_GRAMMAR_EBNF, DSL_GRAMMAR_VERSION } from '../engines/dsl/grammar'
import './HelpMenu.css'

const DOCS_URL = 'https://sho1884.github.io/public-files/NeoCombi/'

/**
 * Top-right dropdown: a link to the public documentation, and copy / download
 * of the DSL EBNF grammar (so it can be handed to an AI assistant to generate
 * DSL, or kept for reference).
 */
export function HelpMenu() {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const onCopyEbnf = async () => {
    try {
      await navigator.clipboard.writeText(DSL_GRAMMAR_EBNF)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard blocked — leave the menu open so the user can retry.
    }
  }

  const onDownloadEbnf = () => {
    const blob = new Blob([DSL_GRAMMAR_EBNF], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `neocombi-dsl-grammar-v${DSL_GRAMMAR_VERSION}.ebnf`
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 100)
    setOpen(false)
  }

  return (
    <div className="help-menu" ref={ref}>
      <button
        type="button"
        className="help-menu__button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        Help
      </button>
      {open ? (
        <div className="help-menu__dropdown" role="menu">
          <a
            className="help-menu__item"
            role="menuitem"
            href={DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
          >
            Documentation (opens in a new tab)
          </a>
          <div className="help-menu__sep" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="help-menu__item"
            onClick={() => void onCopyEbnf()}
          >
            {copied ? 'EBNF grammar copied' : `Copy EBNF grammar (v${DSL_GRAMMAR_VERSION})`}
          </button>
          <button
            type="button"
            role="menuitem"
            className="help-menu__item"
            onClick={onDownloadEbnf}
          >
            Download EBNF grammar (v{DSL_GRAMMAR_VERSION})
          </button>
        </div>
      ) : null}
    </div>
  )
}

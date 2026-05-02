// Browser file I/O for .tmodel project files.
//
// Two implementations are provided behind one interface:
//
//   1. File System Access API (Chrome / Edge / Opera): opens a true file
//      picker, reads / writes the user's actual file in place. Subsequent
//      saves reuse the same handle so the user is never re-prompted for
//      a path until they request "Save As".
//
//   2. Fallback (Firefox / Safari and any other): uses a hidden
//      <input type="file"> for open and a Blob + anchor download for save.
//      Each save triggers a fresh download with the file's existing name.
//
// The active FileSystemFileHandle (if any) is held in module-level state
// because it is per-session and cannot be serialized to JSON.

// Minimal type shapes for the File System Access API. The DOM lib that ships
// with TypeScript 5.9 does not yet include these, so we declare just enough
// surface to call the methods we need without any-casting at the call sites.

type FsWritable = {
  write(data: string): Promise<void>
  close(): Promise<void>
}

type FsHandle = {
  name: string
  getFile(): Promise<{ text(): Promise<string> }>
  createWritable(): Promise<FsWritable>
}

type FsAcceptType = {
  description?: string
  accept: Record<string, string[]>
}

type FsOpenOptions = { types?: FsAcceptType[]; multiple?: boolean }
type FsSaveOptions = { types?: FsAcceptType[]; suggestedName?: string }

type FsApi = {
  showOpenFilePicker(options?: FsOpenOptions): Promise<FsHandle[]>
  showSaveFilePicker(options?: FsSaveOptions): Promise<FsHandle>
}

let activeHandle: FsHandle | null = null

const ACCEPT: FsAcceptType[] = [
  {
    description: 'NeoCombi model file (.tmodel)',
    accept: { 'text/plain': ['.tmodel'] },
  },
]

export type OpenResult = { content: string; name: string }
export type SaveResult = { name: string }

export type SaveOptions = {
  saveAs?: boolean
  suggestedName?: string
}

function fsApi(): FsApi | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as Partial<FsApi>
  if (typeof w.showOpenFilePicker !== 'function') return null
  if (typeof w.showSaveFilePicker !== 'function') return null
  return w as FsApi
}

export function hasActiveHandle(): boolean {
  return activeHandle !== null
}

export function clearActiveHandle(): void {
  activeHandle = null
}

export async function openTmodel(): Promise<OpenResult | null> {
  const api = fsApi()
  if (api) {
    try {
      const [handle] = await api.showOpenFilePicker({ types: ACCEPT, multiple: false })
      if (!handle) return null
      const file = await handle.getFile()
      const content = await file.text()
      activeHandle = handle
      return { content, name: handle.name }
    } catch (e) {
      if (isAbort(e)) return null
      throw e
    }
  }
  // Fallback: hidden file input.
  return await openWithInput()
}

export async function saveTmodel(
  content: string,
  options: SaveOptions = {},
): Promise<SaveResult | null> {
  const api = fsApi()
  if (api) {
    let handle = activeHandle
    if (options.saveAs || !handle) {
      try {
        handle = await api.showSaveFilePicker({
          types: ACCEPT,
          suggestedName: options.suggestedName ?? 'project.tmodel',
        })
      } catch (e) {
        if (isAbort(e)) return null
        throw e
      }
    }
    if (!handle) return null
    activeHandle = handle
    const writable = await handle.createWritable()
    await writable.write(content)
    await writable.close()
    return { name: handle.name }
  }
  // Fallback: trigger download.
  const name = options.suggestedName ?? 'project.tmodel'
  await triggerDownload(content, name)
  // Cannot persist a handle; subsequent saves will re-download.
  activeHandle = null
  return { name }
}

// =============================================================================
// Fallback implementations (Firefox / Safari)
// =============================================================================

function openWithInput(): Promise<OpenResult | null> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.tmodel,text/plain'
    input.style.display = 'none'
    input.addEventListener('change', async () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        document.body.removeChild(input)
        return
      }
      try {
        const content = await file.text()
        activeHandle = null
        resolve({ content, name: file.name })
      } finally {
        document.body.removeChild(input)
      }
    })
    // Some browsers require the input be in the DOM to trigger the picker.
    document.body.appendChild(input)
    input.click()
  })
}

async function triggerDownload(content: string, name: string): Promise<void> {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Slight delay before revoking to be safe across browsers.
  setTimeout(() => URL.revokeObjectURL(url), 100)
}

function isAbort(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'name' in e &&
    (e as { name: unknown }).name === 'AbortError'
  )
}

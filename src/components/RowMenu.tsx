import { useEffect, useRef, useState, type ReactNode } from 'react'

interface RowMenuProps {
  children: ReactNode
}

/** ••• ドロップダウンメニュー（外側クリックで閉じる） */
export function RowMenu({ children }: RowMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [open])

  return (
    <div className="row-menu-wrap" ref={ref}>
      <button
        className="row-menu-btn"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        •••
      </button>
      <div className={`row-menu-dd${open ? ' open' : ''}`} onClick={() => setOpen(false)}>
        {children}
      </div>
    </div>
  )
}

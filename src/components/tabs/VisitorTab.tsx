import { useMemo, useState } from 'react'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { calcVisitorCounts } from '../../lib/calc'
import { normName } from '../../lib/normalize'
import type { Attendee, NewAttendee } from '../../lib/types'
import { RowMenu } from '../RowMenu'

export function VisitorTab({ month }: { month: string }) {
  const data = useData()
  const { state } = data
  const toast = useToast()
  const [pasteInput, setPasteInput] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', company: '' })

  const visitors = (state.attendees[month] || []).filter((a) => a.type === 'ビジター')
  const counts = useMemo(() => calcVisitorCounts(state, month), [state, month])

  const g1: (Attendee & { c: number })[] = []
  const g2: (Attendee & { c: number })[] = []
  const g3: (Attendee & { c: number })[] = []
  for (const a of visitors) {
    const c = counts[normName(a.name)] || 1
    if (c === 1) g1.push({ ...a, c })
    else if (c === 2) g2.push({ ...a, c })
    else g3.push({ ...a, c })
  }

  const register = async () => {
    const lines = pasteInput
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l)
    if (lines.length === 0) {
      toast('名前を入力してください')
      return
    }
    const toAdd: NewAttendee[] = []
    const seen = new Set<string>()
    for (const line of lines) {
      const cols = line.split(/[\t,]/)
      const rawName = (cols[0] || '').trim()
      if (!rawName) continue
      const nn = normName(rawName)
      if (seen.has(nn)) continue
      seen.add(nn)
      toAdd.push({ name: rawName, kana: '', company: '', industry: '', type: 'ビジター', email: '', manual: false })
    }
    const { added } = await data.addAttendees(month, toAdd)
    if (added === 0) {
      toast('新規の名前がありません（すでに登録済みです）')
      return
    }
    setPasteInput('')
    toast(`${added}名をビジターとして登録しました`)
  }

  const startEdit = (a: Attendee) => {
    setEditingId(a.id)
    setEditForm({ name: a.name, company: a.company })
  }
  const saveEdit = async (a: Attendee) => {
    const newName = editForm.name.trim()
    if (!newName) {
      toast('氏名を入力してください')
      return
    }
    const newNorm = normName(newName)
    if (
      newNorm !== normName(a.name) &&
      visitors.some((x) => x.id !== a.id && normName(x.name) === newNorm)
    ) {
      toast('その氏名はすでに登録されています')
      return
    }
    await data.updateAttendee(a.id, { name: newName, company: editForm.company.trim() }, a.name)
    setEditingId(null)
    toast(`${newName} を更新しました`)
  }
  const remove = async (a: Attendee) => {
    if (!confirm(`${a.name} を削除しますか？`)) return
    await data.removeAttendee(a.id)
    toast('削除しました')
  }

  const renderChip = (a: Attendee & { c: number }) => {
    if (editingId === a.id) {
      return (
        <div className="vc-chip editing-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }} key={a.id}>
          <input
            className="edit-input"
            autoFocus
            value={editForm.name}
            placeholder="氏名"
            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveEdit(a)
              if (e.key === 'Escape') setEditingId(null)
            }}
          />
          <input
            className="edit-input"
            value={editForm.company}
            placeholder="所属"
            onChange={(e) => setEditForm((f) => ({ ...f, company: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveEdit(a)
              if (e.key === 'Escape') setEditingId(null)
            }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
            <button className="btn btn-p" style={{ fontSize: '.65rem', padding: '2px 8px' }} onClick={() => void saveEdit(a)}>
              保存
            </button>
            <button className="btn btn-s" style={{ fontSize: '.65rem', padding: '2px 8px' }} onClick={() => setEditingId(null)}>
              取消
            </button>
          </div>
        </div>
      )
    }
    return (
      <div className="vc-chip" key={a.id}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div>{a.name}</div>
          <div className="company">{a.company}</div>
        </div>
        <span className={`visit-badge ${a.c === 1 ? 'v1' : a.c === 2 ? 'v2' : 'v3'}`}>{a.c}回目</span>
        <RowMenu>
          <button className="row-menu-item" onClick={() => startEdit(a)}>
            編集
          </button>
          <button className="row-menu-item danger" onClick={() => void remove(a)}>
            削除
          </button>
        </RowMenu>
      </div>
    )
  }

  const col = (cls: string, label: string, items: (Attendee & { c: number })[]) => (
    <div className={`vc-col ${cls}`}>
      <div className="vc-head">
        <span className="vc-dot" />
        {label}
      </div>
      <div className="vc-body">
        {items.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--muted)', fontSize: '.78rem' }}>いません</div>
        ) : (
          items.map(renderChip)
        )}
      </div>
    </div>
  )

  return (
    <div>
      <div className="vc-paste-box">
        <div className="vc-paste-label">名前を入力（1行に1名ずつ）</div>
        <textarea
          className="paste-textarea"
          style={{ height: 120 }}
          value={pasteInput}
          onChange={(e) => setPasteInput(e.target.value)}
          placeholder={'田中太郎\n山田 花子\n佐藤　一郎\n鈴木次郎'}
        />
        <div className="vc-paste-hint">
          スペース（半角・全角）は自動で除去されます。複数名を一度に貼り付けOK。
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-p" onClick={() => void register()}>
            登録する
          </button>
          <button className="btn btn-s" onClick={() => setPasteInput('')}>
            クリア
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
        <div className="scard visitor">
          <div className="scard-label">1回目</div>
          <div className="scard-num">{g1.length}</div>
        </div>
        <div className="scard" style={{ borderColor: 'var(--student-border)' }}>
          <div className="scard-label" style={{ color: 'var(--student-text)' }}>
            2回目
          </div>
          <div className="scard-num" style={{ color: 'var(--student-text)' }}>
            {g2.length}
          </div>
        </div>
        <div className="scard" style={{ borderColor: 'var(--visitor-border)' }}>
          <div className="scard-label" style={{ color: '#c2410c' }}>
            3回以上
          </div>
          <div className="scard-num" style={{ color: '#c2410c' }}>
            {g3.length}
          </div>
        </div>
      </div>

      <div className="vc-grid">
        {col('vc1', '1回目（今月が初来場）', g1)}
        {col('vc2', '2回目', g2)}
        {col('vc3', '3回以上', g3)}
      </div>
    </div>
  )
}

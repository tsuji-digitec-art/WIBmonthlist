import { useMemo, useRef, useState } from 'react'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import {
  CATEGORIES,
  CATEGORY_CLASS,
  DEFAULT_FEES,
  STATUS_OPTIONS,
  fmtMonth,
  isActualStatus,
} from '../../lib/constants'
import { normName, normalizeType, statusClass } from '../../lib/normalize'
import { parseCsvFull, readFileAsText, downloadCsv } from '../../lib/csv'
import {
  calcVisitorCounts,
  feeForAttendee,
  getPersonFee,
  getStatus,
  isStudentMember,
} from '../../lib/calc'
import type { Attendee, AttendeeType, FeeSet, NewAttendee, StatusValue } from '../../lib/types'
import { FeeCell } from '../FeeCell'
import { RowMenu } from '../RowMenu'

type ImportResult = { ok: true; attendees: NewAttendee[] } | { ok: false; msg: string }

// ---- CSV / 貼り付け パース ----
function buildFromCsv(text: string): ImportResult {
  if (!text.trim()) return { ok: false, msg: 'データが見つかりません' }
  const firstLine = text.split(/\r?\n/)[0]
  const delim = firstLine.includes('\t') ? '\t' : ','
  const allRows = parseCsvFull(text, delim).filter((r) => r.some((c) => c.trim() !== ''))
  if (allRows.length < 2) return { ok: false, msg: 'ヘッダー行とデータ行が必要です。' }

  const headers = allRows[0].map((h) => h.trim())
  const findCol = (...keys: string[]) => {
    for (const k of keys) {
      const i = headers.findIndex((h) => h.includes(k))
      if (i >= 0) return i
    }
    return -1
  }
  const iName = findCol('お名前', '氏名', '名前', 'name')
  const iKana = findCol('フリガナ', 'ふりがな', 'よみ', 'カナ', 'kana')
  const iCompany = findCol('所属', '会社', 'company')
  const iIndustry = findCol('業種', 'industry')
  const iType = findCol('会員種別', '種別', '区分', 'type')
  const iEmail = findCol('メール', 'email', 'mail')

  if (iName < 0 || iType < 0) {
    return {
      ok: false,
      msg: `「お名前」または「会員種別」列が見つかりません。検出した列: ${headers.filter((h) => h).join(' / ')}`,
    }
  }

  const attendees: NewAttendee[] = []
  for (let i = 1; i < allRows.length; i++) {
    const cols = allRows[i]
    if (!cols[iName] || !cols[iName].trim()) continue
    attendees.push({
      name: cols[iName].trim(),
      kana: iKana >= 0 ? (cols[iKana] || '').trim() : '',
      company: iCompany >= 0 ? (cols[iCompany] || '').trim() : '',
      industry: iIndustry >= 0 ? (cols[iIndustry] || '').trim() : '',
      type: normalizeType((cols[iType] || '').trim()),
      email: iEmail >= 0 ? (cols[iEmail] || '').trim() : '',
      manual: false,
    })
  }
  if (attendees.length === 0) return { ok: false, msg: '有効なデータが見つかりませんでした。' }
  return { ok: true, attendees }
}

function buildFromNames(text: string): ImportResult {
  const delim = text.split(/\r?\n/)[0].includes('\t') ? '\t' : ','
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l)
  if (lines.length === 0) return { ok: false, msg: 'データが見つかりません' }
  const attendees: NewAttendee[] = []
  for (const line of lines) {
    const cols = line.split(delim)
    const name = (cols[0] || '').trim().replace(/^["']|["']$/g, '')
    if (!name) continue
    attendees.push({
      name,
      kana: (cols[1] || '').trim().replace(/^["']|["']$/g, ''),
      company: (cols[2] || '').trim().replace(/^["']|["']$/g, ''),
      industry: '',
      type: 'ビジター',
      email: '',
      manual: false,
    })
  }
  if (attendees.length === 0) return { ok: false, msg: '有効な名前が見つかりませんでした' }
  return { ok: true, attendees }
}

export function ListTab({ month }: { month: string }) {
  const data = useData()
  const { state } = data
  const toast = useToast()

  const [search, setSearch] = useState('')
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteInput, setPasteInput] = useState('')
  const [importStatus, setImportStatus] = useState<{ msg: string; cls: 'ok' | 'err' } | null>(null)
  const [feeOpen, setFeeOpen] = useState(false)
  const [feeForm, setFeeForm] = useState<FeeSet>(DEFAULT_FEES)
  const fileRef = useRef<HTMLInputElement>(null)
  const dragId = useRef<string | null>(null)
  const dragFrom = useRef<AttendeeType | null>(null)
  const [dragOver, setDragOver] = useState<AttendeeType | null>(null)

  const attendees = state.attendees[month] || []
  const visitorCounts = useMemo(() => calcVisitorCounts(state, month), [state, month])

  const showStatusMsg = (msg: string, cls: 'ok' | 'err') => {
    setImportStatus({ msg, cls })
    setTimeout(() => setImportStatus(null), 5000)
  }

  // ---- import handlers ----
  const runImport = async (result: ImportResult) => {
    if (!result.ok) {
      showStatusMsg(result.msg, 'err')
      return
    }
    try {
      const { added, skipped } = await data.addAttendees(month, result.attendees)
      showStatusMsg(
        `${added}名をインポートしました（${fmtMonth(month)}）` +
          (skipped > 0 ? `。重複 ${skipped}名はスキップ。` : ''),
        'ok',
      )
    } catch (e) {
      showStatusMsg('保存に失敗しました: ' + (e instanceof Error ? e.message : String(e)), 'err')
    }
  }

  const onFile = async (file: File) => {
    try {
      const text = await readFileAsText(file)
      await runImport(buildFromCsv(text.replace(/^﻿/, '')))
    } catch {
      showStatusMsg('ファイルの読み込みに失敗しました。', 'err')
    }
  }

  const onPasteImport = async () => {
    const raw = pasteInput.trim().replace(/^﻿/, '')
    if (!raw) {
      toast('データを貼り付けてください')
      return
    }
    const firstLine = raw.split(/\r?\n/)[0]
    const HEADER_KEYS = ['名前', '氏名', 'お名前', 'name', '会員', '種別', 'type', 'フリガナ', '所属']
    const hasHeader = HEADER_KEYS.some((k) => firstLine.includes(k))
    await runImport(hasHeader ? buildFromCsv(raw) : buildFromNames(raw))
    setPasteInput('')
    setPasteOpen(false)
  }

  // ---- fee panel ----
  const openFeePanel = () => {
    setFeeForm(state.fees[month] ? { ...DEFAULT_FEES, ...state.fees[month] } : { ...DEFAULT_FEES })
    setFeeOpen((v) => !v)
  }
  const saveFeePanel = async () => {
    await data.saveFees(month, feeForm)
    setFeeOpen(false)
    toast(`${fmtMonth(month)}の金額設定を保存しました`)
  }

  // ---- summaries ----
  const entryTotal = attendees.filter((a) => !a.manual).length
  const actualTotal = attendees.filter((a) => isActualStatus(getStatus(state, month, a.name))).length
  const catCounts = CATEGORIES.map((type) => {
    const group = attendees.filter((a) => a.type === type)
    return {
      type,
      entry: group.filter((a) => !a.manual).length,
      actual: group.filter((a) => isActualStatus(getStatus(state, month, a.name))).length,
    }
  })

  const payCounts: Record<string, number> = { paypay: 0, cash: 0, free: 0, invoice: 0, '': 0 }
  for (const a of attendees) {
    const st = getStatus(state, month, a.name)
    payCounts[st in payCounts ? st : ''] += 1
  }
  const confirmedCount = payCounts.paypay + payCounts.cash + payCounts.free + payCounts.invoice

  // ---- amount summary ----
  let confirmedAmt = 0
  let invoiceAmt = 0
  for (const a of attendees) {
    const st = getStatus(state, month, a.name)
    const fee = feeForAttendee(state, month, a, visitorCounts)
    if (st === 'paypay' || st === 'cash') confirmedAmt += fee
    else if (st === 'invoice') invoiceAmt += fee
  }
  const yen = (n: number) => '¥' + n.toLocaleString('ja-JP')

  // ---- export ----
  const exportCsv = () => {
    if (attendees.length === 0) {
      toast('データがありません')
      return
    }
    const rows: (string | number)[][] = [
      ['月', '氏名', 'フリガナ', '所属', '会員種別', '出欠ステータス', '来場回数（ビジターのみ）'],
    ]
    for (const a of attendees) {
      const st = getStatus(state, month, a.name)
      const stLabel = STATUS_OPTIONS.find((o) => o.val === st)?.label || st
      const vc = a.type === 'ビジター' ? visitorCounts[normName(a.name)] || 1 : ''
      rows.push([fmtMonth(month), a.name, a.kana, a.company, a.type, stLabel, vc])
    }
    downloadCsv(`月例会_${month}.csv`, rows)
  }

  const deleteMonth = async () => {
    if (!confirm(`${fmtMonth(month)}のデータをすべて削除しますか？`)) return
    await data.deleteMonth(month)
    toast('削除しました')
  }

  // 重複検出（月内・全カテゴリ）
  const nameCount: Record<string, number> = {}
  for (const a of attendees) {
    const k = normName(a.name)
    nameCount[k] = (nameCount[k] || 0) + 1
  }

  const payLabels: Record<string, string> = {
    paypay: 'PAYPAY決済済',
    cash: '現金決済済',
    free: '無料',
    invoice: '後日請求',
    '': '未確認',
  }

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.tsv,text/csv,text/tab-separated-values"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onFile(f)
          e.target.value = ''
        }}
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button className="csv-hdr-btn" onClick={() => fileRef.current?.click()}>
          📥 CSVインポート
        </button>
        <button className="csv-hdr-btn" onClick={() => setPasteOpen((v) => !v)}>
          📋 テキスト貼り付け
        </button>
      </div>

      {importStatus && <div className={`import-status ${importStatus.cls}`}>{importStatus.msg}</div>}

      <div className={`paste-panel${pasteOpen ? ' open' : ''}`}>
        <div style={{ fontSize: '.75rem', fontWeight: 800, color: 'var(--muted)', letterSpacing: '.05em', marginBottom: 8 }}>
          📋 テキスト貼り付けインポート
        </div>
        <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginBottom: 8 }}>
          スプレッドシートからコピーしたデータをそのまま貼り付けてください（タブ区切り・CSV形式どちらも可）
        </div>
        <textarea
          className="paste-textarea"
          value={pasteInput}
          onChange={(e) => setPasteInput(e.target.value)}
          placeholder={'【名前のみ（全員ビジター扱い）】\n荒駒 晃\n田中 太郎\n\n【ヘッダーあり（種別自動判定）】\nお名前\tフリガナ\t所属\t会員種別\n田中 太郎\tタナカタロウ\t株式会社〇〇\t正会員'}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="btn btn-p" onClick={() => void onPasteImport()}>
            📋 インポート
          </button>
          <button className="btn btn-s" onClick={() => setPasteOpen(false)}>
            閉じる
          </button>
        </div>
      </div>

      {/* TOP STATS */}
      <div className="top-stats">
        <div className="top-stat-col entry-group">
          <div className="scard top-main-card">
            <div className="scard-label">月次エントリー数</div>
            <div className="scard-num">{entryTotal}</div>
            <div className="scard-sub">名（CSVのみ）</div>
          </div>
          <div className="sub-grid">
            {catCounts.map((c) => (
              <div className="sub-card" key={c.type}>
                <div className="sub-label">{c.type}</div>
                <div className="sub-num">{c.entry}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="top-stat-col actual-group">
          <div className="scard top-main-card">
            <div className="scard-label">実来場者数</div>
            <div className="scard-num">{actualTotal}</div>
            <div className="scard-sub">名（PayPay・現金・無料・後日請求）</div>
          </div>
          <div className="sub-grid">
            {catCounts.map((c) => (
              <div className="sub-card" key={c.type}>
                <div className="sub-label">{c.type}</div>
                <div className="sub-num">{c.actual}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* PAYMENT SUMMARY */}
      {attendees.length > 0 && (
        <div className="pay-summary">
          <span className="pay-summary-label">支払い状況</span>
          {Object.entries(payLabels).map(([val, label]) =>
            payCounts[val] > 0 ? (
              <span className={`pay-chip ${val || 'unset'}`} key={val}>
                {label} {payCounts[val]}名
              </span>
            ) : null,
          )}
          <span className="pay-divider" />
          <span className="pay-total">
            実来場 {confirmedCount}名 ／ エントリー {attendees.length}名
          </span>
        </div>
      )}

      {/* AMOUNT BAR */}
      {attendees.length > 0 && (
        <div className="amount-bar">
          <div className="amount-item">
            <div className="amount-item-label">確認済み</div>
            <div className="amount-item-val ok">{yen(confirmedAmt)}</div>
          </div>
          <span style={{ color: 'var(--border2)' }}>|</span>
          <div className="amount-item">
            <div className="amount-item-label">後日請求</div>
            <div className="amount-item-val pending">{yen(invoiceAmt)}</div>
          </div>
          <span style={{ color: 'var(--border2)' }}>|</span>
          <div className="amount-item">
            <div className="amount-item-label">合計見込み</div>
            <div className="amount-item-val total">{yen(confirmedAmt + invoiceAmt)}</div>
          </div>
          <button
            className="btn btn-s"
            style={{ fontSize: '.7rem', padding: '3px 10px', marginLeft: 'auto' }}
            onClick={openFeePanel}
          >
            ⚙ 金額設定
          </button>
        </div>
      )}

      {/* FEE PANEL */}
      <div className={`fee-panel${feeOpen ? ' open' : ''}`}>
        <div style={{ fontSize: '.75rem', fontWeight: 800, color: 'var(--muted)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 12 }}>
          ⚙ 参加費設定（{fmtMonth(month)}）
        </div>
        <div className="fee-grid">
          {(
            [
              ['member', '正会員'],
              ['v1', 'ビジター（1回目）'],
              ['v2', 'ビジター（2回目）'],
              ['v3plus', 'ビジター（3回以降）'],
              ['support', '支援機関'],
              ['student', '学生'],
            ] as [keyof FeeSet, string][]
          ).map(([key, label]) => (
            <div className="fee-field" key={key}>
              <label>{label}</label>
              <input
                className="fee-input"
                type="number"
                min={0}
                value={feeForm[key]}
                onChange={(e) => setFeeForm((f) => ({ ...f, [key]: parseInt(e.target.value, 10) || 0 }))}
              />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-p" onClick={() => void saveFeePanel()}>
            保存
          </button>
          <button className="btn btn-s" onClick={() => setFeeOpen(false)}>
            閉じる
          </button>
        </div>
      </div>

      {/* SEARCH */}
      <div className="search-wrap">
        <input
          type="text"
          className="search-input"
          placeholder="🔍 氏名・フリガナ・所属で検索..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setSearch('')
          }}
        />
        {search && (
          <button className="search-clear" onClick={() => setSearch('')}>
            ✕ クリア
          </button>
        )}
        <SearchResult month={month} search={search} />
      </div>

      {/* LIST */}
      {attendees.length === 0 ? (
        <div className="section">
          <div className="empty-state">
            CSVをインポートするか、各カテゴリの「＋ 手動追加」で登録してください
          </div>
        </div>
      ) : (
        <div className="list-grid">
          <div className="list-col">
            <Section
              month={month}
              cat="正会員"
              search={search}
              nameCount={nameCount}
              visitorCounts={visitorCounts}
              dragId={dragId}
              dragFrom={dragFrom}
              dragOver={dragOver}
              setDragOver={setDragOver}
            />
          </div>
          <div className="list-col">
            <Section
              month={month}
              cat="ビジター"
              search={search}
              nameCount={nameCount}
              visitorCounts={visitorCounts}
              dragId={dragId}
              dragFrom={dragFrom}
              dragOver={dragOver}
              setDragOver={setDragOver}
            />
          </div>
          <div className="list-col">
            <Section
              month={month}
              cat="支援機関"
              search={search}
              nameCount={nameCount}
              visitorCounts={visitorCounts}
              dragId={dragId}
              dragFrom={dragFrom}
              dragOver={dragOver}
              setDragOver={setDragOver}
            />
            <Section
              month={month}
              cat="学生"
              search={search}
              nameCount={nameCount}
              visitorCounts={visitorCounts}
              dragId={dragId}
              dragFrom={dragFrom}
              dragOver={dragOver}
              setDragOver={setDragOver}
            />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-s" onClick={exportCsv}>
          📤 この月のCSVエクスポート
        </button>
        <button className="btn btn-d" style={{ marginLeft: 'auto' }} onClick={() => void deleteMonth()}>
          この月のデータを削除
        </button>
      </div>
    </div>
  )
}

// ====================================================================
//  検索ヒット件数の表示
// ====================================================================
function SearchResult({ month, search }: { month: string; search: string }) {
  const { state } = useData()
  if (!search) return null
  const q = search.toLowerCase()
  const attendees = state.attendees[month] || []
  const hits = attendees.filter(
    (a) =>
      a.name.toLowerCase().includes(q) ||
      (a.kana || '').toLowerCase().includes(q) ||
      (a.company || '').toLowerCase().includes(q),
  ).length
  return <span className="search-result">{hits}件ヒット</span>
}

// ====================================================================
//  カテゴリ別セクション
// ====================================================================
interface SectionProps {
  month: string
  cat: AttendeeType
  search: string
  nameCount: Record<string, number>
  visitorCounts: Record<string, number>
  dragId: React.MutableRefObject<string | null>
  dragFrom: React.MutableRefObject<AttendeeType | null>
  dragOver: AttendeeType | null
  setDragOver: (c: AttendeeType | null) => void
}

function Section({
  month,
  cat,
  search,
  nameCount,
  visitorCounts,
  dragId,
  dragFrom,
  dragOver,
  setDragOver,
}: SectionProps) {
  const data = useData()
  const { state } = data
  const toast = useToast()
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', kana: '', company: '', industry: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', kana: '', company: '' })

  const all = (state.attendees[month] || []).filter((a) => a.type === cat)
  all.sort((a, b) => (a.kana || a.name || '').localeCompare(b.kana || b.name || '', 'ja'))
  const totalCount = all.length

  const q = search.toLowerCase()
  const items = q
    ? all.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.kana || '').toLowerCase().includes(q) ||
          (a.company || '').toLowerCase().includes(q),
      )
    : all

  const cls = CATEGORY_CLASS[cat]

  const onStatusChange = (a: Attendee, val: StatusValue) => {
    void data.setStatus(month, a.name, val)
  }

  const submitAdd = async () => {
    const name = addForm.name.trim()
    if (!name) {
      toast('氏名を入力してください')
      return
    }
    const ok = await data.addAttendee(month, {
      name,
      kana: addForm.kana.trim(),
      company: addForm.company.trim(),
      industry: addForm.industry.trim(),
      type: cat,
      email: '',
      manual: true,
    })
    if (!ok) {
      toast('同じ名前がすでに登録されています')
      return
    }
    setAddForm({ name: '', kana: '', company: '', industry: '' })
    toast(`${name} を追加しました（${cat}）`)
  }

  const startEdit = (a: Attendee) => {
    setEditingId(a.id)
    setEditForm({ name: a.name, kana: a.kana, company: a.company })
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
      all.some((x) => x.id !== a.id && normName(x.name) === newNorm)
    ) {
      toast('その氏名はすでに登録されています')
      return
    }
    await data.updateAttendee(
      a.id,
      { name: newName, kana: editForm.kana.trim(), company: editForm.company.trim() },
      a.name,
    )
    setEditingId(null)
    toast(`${newName} を更新しました`)
  }

  const remove = async (a: Attendee) => {
    if (!confirm(`${normName(a.name)} を削除しますか？`)) return
    await data.removeAttendee(a.id)
    toast('削除しました')
  }

  const onDrop = async () => {
    setDragOver(null)
    const id = dragId.current
    const from = dragFrom.current
    dragId.current = null
    dragFrom.current = null
    if (!id || from === cat) return
    await data.changeAttendeeType(id, cat)
    toast(`「${cat}」に移動しました`)
  }

  return (
    <div
      className={`section ${cls}${dragOver === cat ? ' drag-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDragOver(cat)
      }}
      onDragLeave={(e) => {
        if (e.relatedTarget && (e.currentTarget as Node).contains(e.relatedTarget as Node)) return
        if (dragOver === cat) setDragOver(null)
      }}
      onDrop={() => void onDrop()}
    >
      <div className="section-header">
        <div className="section-title">{cat}</div>
        <div className="section-count">{totalCount}名</div>
        <div className="btn-row">
          <button
            className="btn btn-s"
            style={{ fontSize: '.72rem', padding: '4px 10px' }}
            onClick={() => setAddOpen((v) => !v)}
          >
            ＋ 手動追加
          </button>
        </div>
      </div>

      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>出欠</th>
              <th style={{ textAlign: 'right' }}>金額</th>
              <th>氏名</th>
              <th>フリガナ</th>
              <th>所属</th>
              {cat === 'ビジター' && <th>来場</th>}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={9} className="empty-state">
                  {q ? '該当なし' : 'データなし'}
                </td>
              </tr>
            ) : (
              items.map((a, i) => {
                const st = getStatus(state, month, a.name)
                const rawNn = normName(a.name)
                const isDup = nameCount[rawNn] > 1
                const isEditing = editingId === a.id
                const isStudentRow = cat === '学生' || isStudentMember(state, rawNn)
                const opts = STATUS_OPTIONS.filter((o) =>
                  isStudentRow ? o.val === '' || o.val === 'free' : o.val !== 'free',
                )
                const vc = cat === 'ビジター' ? visitorCounts[rawNn] || 1 : 0
                const fee = feeForAttendee(state, month, a, visitorCounts)
                const isFree = st === 'free'
                const overridden = getPersonFee(state, month, rawNn) !== null

                if (isEditing) {
                  return (
                    <tr className="editing-row" key={a.id}>
                      <td className="td-num">{i + 1}</td>
                      <td>
                        <select
                          className={`status-sel ${statusClass(st)}`}
                          value={st}
                          onChange={(e) => onStatusChange(a, e.target.value as StatusValue)}
                        >
                          {opts.map((o) => (
                            <option key={o.val} value={o.val}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <FeeCell
                          fee={fee}
                          overridden={overridden}
                          disabled={isFree}
                          onCommit={(v) => void data.setPersonFee(month, rawNn, v)}
                          onReset={() => {
                            void data.resetPersonFee(month, rawNn)
                            toast('デフォルト金額に戻しました')
                          }}
                        />
                      </td>
                      <td>
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
                      </td>
                      <td>
                        <input
                          className="edit-input"
                          value={editForm.kana}
                          placeholder="フリガナ"
                          onChange={(e) => setEditForm((f) => ({ ...f, kana: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void saveEdit(a)
                            if (e.key === 'Escape') setEditingId(null)
                          }}
                        />
                      </td>
                      <td>
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
                      </td>
                      {cat === 'ビジター' && <td></td>}
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button
                          className="btn btn-p"
                          style={{ fontSize: '.68rem', padding: '2px 8px' }}
                          onClick={() => void saveEdit(a)}
                        >
                          保存
                        </button>
                        <button
                          className="btn btn-s"
                          style={{ fontSize: '.68rem', padding: '2px 8px', marginLeft: 4 }}
                          onClick={() => setEditingId(null)}
                        >
                          取消
                        </button>
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr
                    className={isDup ? 'dup-row' : ''}
                    key={a.id}
                    draggable
                    title="ドラッグで種別変更"
                    onDragStart={() => {
                      dragId.current = a.id
                      dragFrom.current = cat
                    }}
                    onDragEnd={() => {
                      setDragOver(null)
                    }}
                  >
                    <td className="td-num">{i + 1}</td>
                    <td>
                      <select
                        className={`status-sel ${statusClass(st)}`}
                        value={st}
                        onChange={(e) => onStatusChange(a, e.target.value as StatusValue)}
                      >
                        {opts.map((o) => (
                          <option key={o.val} value={o.val}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <FeeCell
                        fee={fee}
                        overridden={overridden}
                        disabled={isFree}
                        onCommit={(v) => void data.setPersonFee(month, rawNn, v)}
                        onReset={() => {
                          void data.resetPersonFee(month, rawNn)
                          toast('デフォルト金額に戻しました')
                        }}
                      />
                    </td>
                    <td className="td-name">
                      {a.name}
                      {isDup && (
                        <span className="dup-badge" title="同月に同名が存在します">
                          ⚠ 重複
                        </span>
                      )}
                    </td>
                    <td className="td-kana">{a.kana}</td>
                    <td className="td-company" title={a.company}>
                      {a.company}
                    </td>
                    {cat === 'ビジター' && (
                      <td>
                        <span className={`visit-badge ${vc === 1 ? 'v1' : vc === 2 ? 'v2' : 'v3'}`}>
                          {vc}回目
                        </span>
                      </td>
                    )}
                    <td>
                      <RowMenu>
                        <button className="row-menu-item" onClick={() => startEdit(a)}>
                          編集
                        </button>
                        <button className="row-menu-item danger" onClick={() => void remove(a)}>
                          削除
                        </button>
                      </RowMenu>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <div className={`manual-form${addOpen ? ' open' : ''}`}>
        <div className="mf-field">
          <div className="mf-label">
            氏名 <span style={{ color: 'var(--danger)' }}>*</span>
          </div>
          <input
            className="mf-input"
            placeholder="田中 太郎"
            style={{ width: 120 }}
            value={addForm.name}
            onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitAdd()
            }}
          />
        </div>
        <div className="mf-field">
          <div className="mf-label">フリガナ</div>
          <input
            className="mf-input"
            placeholder="タナカタロウ"
            style={{ width: 120 }}
            value={addForm.kana}
            onChange={(e) => setAddForm((f) => ({ ...f, kana: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitAdd()
            }}
          />
        </div>
        <div className="mf-field">
          <div className="mf-label">所属</div>
          <input
            className="mf-input"
            placeholder="株式会社〇〇"
            style={{ width: 150 }}
            value={addForm.company}
            onChange={(e) => setAddForm((f) => ({ ...f, company: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitAdd()
            }}
          />
        </div>
        <div className="mf-field">
          <div className="mf-label">業種</div>
          <input
            className="mf-input"
            placeholder="IT"
            style={{ width: 100 }}
            value={addForm.industry}
            onChange={(e) => setAddForm((f) => ({ ...f, industry: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitAdd()
            }}
          />
        </div>
        <button className="btn btn-p" onClick={() => void submitAdd()}>
          追加
        </button>
        <button className="btn btn-s" onClick={() => setAddOpen(false)}>
          閉じる
        </button>
      </div>
    </div>
  )
}

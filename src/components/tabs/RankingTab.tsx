import { useRef, useState } from 'react'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { fyElapsedMonths, memberRankingData } from '../../lib/calc'
import { normName } from '../../lib/normalize'
import { parseCsvFull, readFileAsText } from '../../lib/csv'
import type { NewMember } from '../../lib/types'
import { RowMenu } from '../RowMenu'

function parseMasterCsv(text: string): { ok: true; members: NewMember[] } | { ok: false; msg: string } {
  if (!text.trim()) return { ok: false, msg: 'データがありません' }
  const firstLine = text.split(/\r?\n/)[0]
  const delim = firstLine.includes('\t') ? '\t' : ','
  const allRows = parseCsvFull(text, delim).filter((r) => r.some((c) => c.trim() !== ''))
  if (allRows.length < 2) return { ok: false, msg: 'ヘッダーとデータが必要です' }

  const headers = allRows[0].map((h) => h.trim())
  const fc = (...keys: string[]) => {
    for (const k of keys) {
      const i = headers.findIndex((h) => h.includes(k))
      if (i >= 0) return i
    }
    return -1
  }
  const iName = fc('氏名', '名前')
  const iKana = fc('よみ', 'フリガナ', 'ふりがな')
  const iCo = fc('会社', '所属')
  const iType = fc('会員区分', '種別')
  const iJoin = fc('入会年月')
  if (iName < 0) return { ok: false, msg: '「氏名」列が見つかりません' }

  const members: NewMember[] = []
  for (let i = 1; i < allRows.length; i++) {
    const c = allRows[i]
    const name = (c[iName] || '').trim()
    if (!name) continue
    members.push({
      name,
      kana: iKana >= 0 ? (c[iKana] || '').trim() : '',
      company: iCo >= 0 ? (c[iCo] || '').trim() : '',
      memberType: iType >= 0 ? (c[iType] || '').trim() : '',
      joinDate: iJoin >= 0 ? (c[iJoin] || '').trim() : '',
    })
  }
  if (members.length === 0) return { ok: false, msg: '有効なデータがありません' }
  return { ok: true, members }
}

export function RankingTab() {
  const data = useData()
  const { state } = data
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', kana: '', company: '', memberType: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', company: '', memberType: '' })

  const hasMaster = state.members.length > 0
  const { entries, fiscalYears } = memberRankingData(state)

  const onFile = async (file: File) => {
    try {
      const text = await readFileAsText(file)
      const res = parseMasterCsv(text.replace(/^﻿/, ''))
      if (!res.ok) {
        toast(res.msg)
        return
      }
      await data.setMembers(res.members)
      toast(`${res.members.length}名の会員マスタをインポートしました`)
    } catch {
      toast('ファイルの読み込みに失敗しました')
    }
  }

  const clearMaster = async () => {
    if (!confirm('全会員マスタをクリアしますか？')) return
    await data.clearMembers()
    toast('会員マスタをクリアしました')
  }

  const submitAdd = async () => {
    const name = addForm.name.trim()
    if (!name) {
      toast('氏名を入力してください')
      return
    }
    const ok = await data.addMember({
      name,
      kana: addForm.kana.trim(),
      company: addForm.company.trim(),
      memberType: addForm.memberType.trim(),
      joinDate: '',
    })
    if (!ok) {
      toast('同じ名前がすでに登録されています')
      return
    }
    setAddForm({ name: '', kana: '', company: '', memberType: '' })
    toast(`${name} を追加しました`)
  }

  const startEdit = (id: string, name: string, company: string, memberType: string) => {
    setEditingId(id)
    setEditForm({ name, company, memberType })
  }
  const saveEdit = async (id: string, oldName: string) => {
    const newName = editForm.name.trim()
    if (!newName) {
      toast('氏名を入力してください')
      return
    }
    const newNorm = normName(newName)
    if (
      newNorm !== normName(oldName) &&
      state.members.some((m) => m.id !== id && normName(m.name) === newNorm)
    ) {
      toast('その氏名はすでに登録されています')
      return
    }
    await data.updateMember(id, {
      name: newName,
      company: editForm.company.trim(),
      memberType: editForm.memberType.trim(),
    })
    setEditingId(null)
    toast(`${newName} を更新しました`)
  }
  const removeMaster = async (id: string, name: string) => {
    if (!confirm(`${name} をマスタから削除しますか？`)) return
    await data.removeMember(id)
    toast('削除しました')
  }

  // 編集・削除には members の id が必要。entries は氏名から逆引き。
  const memberIdByNorm: Record<string, string> = {}
  for (const m of state.members) memberIdByNorm[normName(m.name)] = m.id

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onFile(f)
          e.target.value = ''
        }}
      />

      <div className="master-bar">
        <span className="master-bar-label">全会員マスタ</span>
        <span className="master-count">
          {hasMaster ? `${state.members.length}名登録済み` : '未登録（登録するとランキングに全員表示）'}
        </span>
        <button
          className="btn btn-p"
          style={{ fontSize: '.72rem', padding: '4px 12px' }}
          onClick={() => fileRef.current?.click()}
        >
          📥 CSVインポート
        </button>
        <button className="btn btn-d" style={{ fontSize: '.72rem', padding: '4px 10px' }} onClick={() => void clearMaster()}>
          クリア
        </button>
        <button
          className="btn btn-s"
          style={{ fontSize: '.72rem', padding: '4px 10px' }}
          onClick={() => setAddOpen((v) => !v)}
        >
          ＋ 手動追加
        </button>
        <span style={{ fontSize: '.7rem', color: 'var(--muted)' }}>
          ※ NO／入会年月／会員区分／氏名／よみ／会社名 列のCSV可
        </span>
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
          <div className="mf-label">会社名</div>
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
          <div className="mf-label">会員区分</div>
          <input
            className="mf-input"
            placeholder="正会員B"
            style={{ width: 100 }}
            value={addForm.memberType}
            onChange={(e) => setAddForm((f) => ({ ...f, memberType: e.target.value }))}
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

      <div className="section">
        <div className="section-header member">
          <div className="section-title" style={{ color: 'var(--member-text)' }}>
            月例会来場率
          </div>
          <div
            className="section-count"
            style={{ background: 'var(--member-bg)', color: 'var(--member-text)', fontSize: '.68rem' }}
          >
            PayPay・現金決済確認済のみ集計
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="rank-table">
            <thead>
              <tr>
                <th>#</th>
                {hasMaster && <th style={{ whiteSpace: 'nowrap' }}>会員区分</th>}
                <th>氏名</th>
                <th>会社名</th>
                {hasMaster && <th style={{ whiteSpace: 'nowrap', color: 'var(--muted)' }}>入会年月</th>}
                {fiscalYears.map((fy) => {
                  const el = fyElapsedMonths(fy)
                  return (
                    <th key={fy} colSpan={2} style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {fy}年度
                      <div style={{ fontSize: '.6rem', fontWeight: 400, color: 'var(--muted)' }}>
                        参加率 /{el}回
                      </div>
                    </th>
                  )
                })}
                <th style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>合計</th>
                {hasMaster && <th></th>}
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => {
                const attended = e.total > 0
                const nn = normName(e.name)
                const id = memberIdByNorm[nn]
                const isEditing = editingId === id && id !== undefined
                const rc = attended
                  ? i === 0
                    ? 'rank-gold'
                    : i === 1
                      ? 'rank-silver'
                      : i === 2
                        ? 'rank-bronze'
                        : 'rank-num'
                  : 'rank-num'
                const badge = e.total >= 10 ? 'v3' : e.total >= 5 ? 'v2' : 'v1'

                const fyCells = fiscalYears.map((fy) => {
                  const cnt = e.fy[fy] || 0
                  const el = fyElapsedMonths(fy)
                  const pct = el > 0 ? Math.round((cnt / el) * 100) : 0
                  const pctColor = pct >= 80 ? 'var(--support-text)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)'
                  return (
                    <FyCell
                      key={fy}
                      cnt={cnt}
                      el={el}
                      pct={pct}
                      pctColor={pctColor}
                    />
                  )
                })

                if (isEditing) {
                  return (
                    <tr className="editing-row" key={id}>
                      <td className={rc}>{attended ? i + 1 : '─'}</td>
                      {hasMaster && (
                        <td>
                          <input
                            className="edit-input"
                            style={{ width: 90 }}
                            value={editForm.memberType}
                            onChange={(ev) => setEditForm((f) => ({ ...f, memberType: ev.target.value }))}
                          />
                        </td>
                      )}
                      <td>
                        <input
                          className="edit-input"
                          autoFocus
                          style={{ width: 100 }}
                          value={editForm.name}
                          onChange={(ev) => setEditForm((f) => ({ ...f, name: ev.target.value }))}
                        />
                      </td>
                      <td>
                        <input
                          className="edit-input"
                          style={{ width: 130 }}
                          value={editForm.company}
                          onChange={(ev) => setEditForm((f) => ({ ...f, company: ev.target.value }))}
                        />
                      </td>
                      {hasMaster && <td></td>}
                      {fyCells}
                      <td style={{ textAlign: 'center' }}>
                        {attended ? <span className={`visit-badge ${badge}`}>{e.total}回</span> : '─'}
                      </td>
                      {hasMaster && (
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button
                            className="btn btn-p"
                            style={{ fontSize: '.65rem', padding: '2px 7px' }}
                            onClick={() => void saveEdit(id, e.name)}
                          >
                            保存
                          </button>
                          <button
                            className="btn btn-s"
                            style={{ fontSize: '.65rem', padding: '2px 7px' }}
                            onClick={() => setEditingId(null)}
                          >
                            取消
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                }

                return (
                  <tr key={id ?? nn} style={!attended ? { opacity: 0.55 } : undefined}>
                    <td className={rc}>{attended ? i + 1 : '─'}</td>
                    {hasMaster && (
                      <td style={{ fontSize: '.72rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                        {e.memberType}
                      </td>
                    )}
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{e.name}</td>
                    <td
                      style={{
                        color: 'var(--muted)',
                        fontSize: '.78rem',
                        maxWidth: 150,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={e.company || ''}
                    >
                      {e.company || ''}
                    </td>
                    {hasMaster && (
                      <td style={{ fontSize: '.72rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                        {e.joinDate || ''}
                      </td>
                    )}
                    {fyCells}
                    <td style={{ textAlign: 'center' }}>
                      {attended ? (
                        <span className={`visit-badge ${badge}`}>{e.total}回</span>
                      ) : (
                        <span style={{ color: 'var(--muted)', fontSize: '.78rem' }}>─</span>
                      )}
                    </td>
                    {hasMaster && (
                      <td>
                        {id && (
                          <RowMenu>
                            <button
                              className="row-menu-item"
                              onClick={() => startEdit(id, e.name, e.company || '', e.memberType)}
                            >
                              編集
                            </button>
                            <button className="row-menu-item danger" onClick={() => void removeMaster(id, e.name)}>
                              削除
                            </button>
                          </RowMenu>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
          {entries.length === 0 && (
            <div className="empty-state">
              実来場データがありません（PayPay/現金決済済のデータが必要です）
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FyCell({
  cnt,
  el,
  pct,
  pctColor,
}: {
  cnt: number
  el: number
  pct: number
  pctColor: string
}) {
  return (
    <>
      <td
        style={{
          textAlign: 'center',
          fontSize: '.82rem',
          fontWeight: cnt ? 700 : 400,
          color: cnt ? 'var(--text)' : 'var(--muted)',
        }}
      >
        {cnt || '─'}
      </td>
      <td
        style={{
          textAlign: 'center',
          fontSize: '.82rem',
          fontWeight: 700,
          color: el > 0 && cnt ? pctColor : 'var(--muted)',
        }}
      >
        {el > 0 ? (
          cnt ? (
            <>
              {pct}%
              <div style={{ fontSize: '.65rem', fontWeight: 400, color: 'var(--muted)' }}>
                {cnt}/{el}
              </div>
            </>
          ) : (
            '0%'
          )
        ) : (
          '─'
        )}
      </td>
    </>
  )
}

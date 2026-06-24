import { useState } from 'react'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { GRAPH_MONTHS, NAV_MONTHS, fmtMonth, isActualStatus } from '../../lib/constants'
import { getStatus } from '../../lib/calc'

const H = 120

export function GraphTab() {
  const data = useData()
  const { state } = data
  const toast = useToast()
  const [panelOpen, setPanelOpen] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})

  // ---- graph1: 月別 参加人数（種別別 積み上げ） ----
  const totals = GRAPH_MONTHS.map((ym) => {
    const list = state.attendees[ym] || []
    return {
      member: list.filter((a) => a.type === '正会員').length,
      visitor: list.filter((a) => a.type === 'ビジター').length,
      support: list.filter((a) => a.type === '支援機関').length,
      student: list.filter((a) => a.type === '学生').length,
    }
  })
  const maxTotal = Math.max(...totals.map((t) => t.member + t.visitor + t.support + t.student), 1)

  // ---- graph2: 会員参加率 ----
  const openPanel = () => {
    if (!panelOpen) {
      const f: Record<string, string> = {}
      for (const [ym, c] of Object.entries(state.memberCounts)) f[ym] = String(c)
      setForm(f)
    }
    setPanelOpen((v) => !v)
  }

  const monthsForPanel = (() => {
    const months = NAV_MONTHS.filter((ym) => (state.attendees[ym] || []).length > 0 || state.memberCounts[ym])
    return months.length > 0 ? months : NAV_MONTHS.slice(-6)
  })()

  const saveCounts = async () => {
    const counts: Record<string, number> = {}
    for (const [ym, v] of Object.entries(form)) {
      const n = parseInt(v, 10)
      if (!isNaN(n) && n > 0) counts[ym] = n
    }
    await data.saveMemberCounts(counts)
    setPanelOpen(false)
    toast('会員数設定を保存しました')
  }

  return (
    <div>
      <div className="graph-card">
        <div className="graph-title">月別 参加人数の推移</div>
        <div className="bar-chart">
          {GRAPH_MONTHS.map((ym, i) => {
            const t = totals[i]
            const total = t.member + t.visitor + t.support + t.student
            const seg = (v: number) => Math.round((v / maxTotal) * H)
            return (
              <div className="bar-group" key={ym}>
                <div className="bar-val">{total || ''}</div>
                <div className="bar-stack">
                  {t.student > 0 && <div className="bar-seg" style={{ height: seg(t.student), background: '#7e22ce' }} />}
                  {t.support > 0 && <div className="bar-seg" style={{ height: seg(t.support), background: '#15803d' }} />}
                  {t.visitor > 0 && <div className="bar-seg" style={{ height: seg(t.visitor), background: '#ea580c' }} />}
                  {t.member > 0 && <div className="bar-seg" style={{ height: seg(t.member), background: '#2563eb' }} />}
                </div>
                <div className="bar-lbl">{ym.slice(5)}月</div>
              </div>
            )
          })}
        </div>
        <div className="graph-legend">
          <div className="legend-item"><div className="legend-dot" style={{ background: '#2563eb' }} />正会員</div>
          <div className="legend-item"><div className="legend-dot" style={{ background: '#ea580c' }} />ビジター</div>
          <div className="legend-item"><div className="legend-dot" style={{ background: '#15803d' }} />支援機関</div>
          <div className="legend-item"><div className="legend-dot" style={{ background: '#7e22ce' }} />学生</div>
        </div>
      </div>

      <div className="graph-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div className="graph-title" style={{ marginBottom: 0 }}>
            会員参加率（月別）
          </div>
          <button className="btn btn-s" style={{ fontSize: '.7rem', padding: '3px 10px' }} onClick={openPanel}>
            ⚙ 会員数設定
          </button>
        </div>

        {panelOpen && (
          <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 16px', marginBottom: 14 }}>
            <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 10 }}>
              月ごとの総会員数を入力（参加率の分母）
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))',
                gap: 8,
                marginBottom: 12,
              }}
            >
              {monthsForPanel.map((ym) => (
                <div key={ym} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '.75rem', fontWeight: 700, minWidth: 68 }}>{fmtMonth(ym)}</span>
                  <input
                    type="number"
                    className="fee-input"
                    min={0}
                    style={{ width: 70 }}
                    placeholder="人数"
                    value={form[ym] ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, [ym]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-p" onClick={() => void saveCounts()}>
                保存
              </button>
              <button className="btn btn-s" onClick={() => setPanelOpen(false)}>
                閉じる
              </button>
            </div>
          </div>
        )}

        <div className="bar-chart">
          {NAV_MONTHS.map((ym) => {
            const list = state.attendees[ym] || []
            const attending = list.filter(
              (a) => a.type !== 'ビジター' && isActualStatus(getStatus(state, ym, a.name)),
            ).length
            const total = state.memberCounts[ym] || 0
            const rate = total > 0 ? Math.round((attending / total) * 100) : null
            const barColor =
              rate === null
                ? '#d1d5db'
                : rate >= 80
                  ? '#2563eb'
                  : rate >= 60
                    ? '#ea580c'
                    : rate >= 40
                      ? '#d97706'
                      : '#dc2626'
            const barH = rate !== null ? Math.round((rate / 100) * H) : 0
            return (
              <div className="bar-group" key={ym}>
                <div className="bar-val" style={{ fontSize: '.65rem' }}>
                  {rate !== null ? rate + '%' : ''}
                </div>
                <div className="bar-stack">
                  {barH ? (
                    <div className="bar-seg" style={{ height: barH, background: barColor }} />
                  ) : (
                    <div style={{ height: 4, background: '#e5e7eb', borderRadius: 2, width: '100%' }} />
                  )}
                </div>
                <div className="bar-lbl">{ym.slice(5)}月</div>
              </div>
            )
          })}
        </div>
        <div className="graph-legend">
          <div className="legend-item"><div className="legend-dot" style={{ background: '#2563eb' }} />80%以上</div>
          <div className="legend-item"><div className="legend-dot" style={{ background: '#ea580c' }} />60〜79%</div>
          <div className="legend-item"><div className="legend-dot" style={{ background: '#d97706' }} />40〜59%</div>
          <div className="legend-item"><div className="legend-dot" style={{ background: '#dc2626' }} />40%未満</div>
          <div className="legend-item"><div className="legend-dot" style={{ background: '#d1d5db' }} />会員数未設定</div>
        </div>
      </div>
    </div>
  )
}

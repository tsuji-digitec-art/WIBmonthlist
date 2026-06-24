import { useState } from 'react'
import { useData } from './context/DataContext'
import { NAV_MONTHS, currentMonthDefault, fmtMonth } from './lib/constants'
import { ListTab } from './components/tabs/ListTab'
import { VisitorTab } from './components/tabs/VisitorTab'
import { RankingTab } from './components/tabs/RankingTab'
import { GraphTab } from './components/tabs/GraphTab'
import { BackupTab } from './components/tabs/BackupTab'

type Tab = 'list' | 'visitor' | 'ranking' | 'graph' | 'backup'

const TABS: { id: Tab; label: string }[] = [
  { id: 'list', label: '出席リスト' },
  { id: 'visitor', label: 'ビジター来場回数' },
  { id: 'ranking', label: '累計ランキング' },
  { id: 'graph', label: 'グラフ' },
  { id: 'backup', label: 'バックアップ' },
]

function initialMonth(): string {
  const d = currentMonthDefault()
  if (NAV_MONTHS.includes(d)) return d
  // 範囲外なら最も近い月にフォールバック
  return d < NAV_MONTHS[0] ? NAV_MONTHS[0] : NAV_MONTHS[NAV_MONTHS.length - 1]
}

function ConnBadge() {
  const { conn, errorMsg } = useData()
  if (conn === 'connected')
    return <span className="conn-badge conn-ok">● リアルタイム接続中</span>
  if (conn === 'connecting')
    return <span className="conn-badge conn-local">● 接続中...</span>
  if (conn === 'unconfigured')
    return <span className="conn-badge conn-err" title="VITE_SUPABASE_URL / ANON_KEY を設定してください">● 未設定</span>
  return (
    <span className="conn-badge conn-err" title={errorMsg}>
      ○ 接続エラー
    </span>
  )
}

export default function App() {
  const [month, setMonth] = useState<string>(initialMonth)
  const [tab, setTab] = useState<Tab>('list')

  const shiftMonth = (dir: number) => {
    const idx = NAV_MONTHS.indexOf(month)
    const ni = Math.max(0, Math.min(NAV_MONTHS.length - 1, idx + dir))
    setMonth(NAV_MONTHS[ni])
  }

  return (
    <>
      <div className="header">
        <div className="header-logo">月例会 管理</div>
        <div className="header-month">
          <button className="month-btn" onClick={() => shiftMonth(-1)}>
            ◀
          </button>
          <span className="month-label">{fmtMonth(month)}</span>
          <button className="month-btn" onClick={() => shiftMonth(1)}>
            ▶
          </button>
          <select className="month-select" value={month} onChange={(e) => setMonth(e.target.value)}>
            {NAV_MONTHS.map((m) => (
              <option key={m} value={m}>
                {fmtMonth(m)}
              </option>
            ))}
          </select>
        </div>
        <ConnBadge />
        <nav className="nav-tabs">
          {TABS.map((t) => (
            <div
              key={t.id}
              className={`nav-tab${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </div>
          ))}
        </nav>
      </div>

      <div className="wrap">
        {tab === 'list' && <ListTab month={month} />}
        {tab === 'visitor' && <VisitorTab month={month} />}
        {tab === 'ranking' && <RankingTab />}
        {tab === 'graph' && <GraphTab />}
        {tab === 'backup' && <BackupTab />}
      </div>
    </>
  )
}

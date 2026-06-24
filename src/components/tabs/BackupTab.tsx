import { useRef, useState } from 'react'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { downloadJson } from '../../lib/csv'
import type { NewAttendee, StatusValue } from '../../lib/types'

const BACKUP_KEY = 'meeting_last_backup'

export function BackupTab() {
  const data = useData()
  const { state, conn, errorMsg } = data
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [, force] = useState(0)

  const monthCount = Object.keys(state.attendees).length
  const totalAttendees = Object.values(state.attendees).reduce((s, a) => s + a.length, 0)

  const buildExportData = (): Record<string, NewAttendee[]> => {
    const out: Record<string, NewAttendee[]> = {}
    for (const [month, list] of Object.entries(state.attendees)) {
      out[month] = list.map((a) => ({
        name: a.name,
        kana: a.kana,
        company: a.company,
        industry: a.industry,
        type: a.type,
        email: a.email,
        manual: a.manual,
      }))
    }
    return out
  }

  const exportJson = () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: buildExportData(),
      statuses: state.statuses,
    }
    const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    downloadJson(`meeting_backup_${ts}.json`, payload)
    localStorage.setItem(BACKUP_KEY, new Date().toISOString())
    force((n) => n + 1)
    toast('バックアップを保存しました')
  }

  const importJson = (file: File) => {
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const payload = JSON.parse(e.target!.result as string)
        if (!payload.data || !payload.statuses) {
          toast('JSONの形式が正しくありません')
          return
        }
        const mc = Object.keys(payload.data).length
        if (!confirm(`${mc}ヶ月分のデータを復元します。\n現在のデータはすべて上書きされます。よろしいですか？`)) return
        await data.restoreBackup(
          payload.data as Record<string, NewAttendee[]>,
          payload.statuses as Record<string, StatusValue>,
        )
        toast(`${mc}ヶ月分のデータを復元しました`)
      } catch {
        toast('ファイルの読み込みに失敗しました')
      }
    }
    reader.readAsText(file, 'utf-8')
  }

  const sizeKB = (
    new Blob([JSON.stringify(state.attendees)]).size + new Blob([JSON.stringify(state.statuses)]).size
  ) / 1024
  const lastBackup = localStorage.getItem(BACKUP_KEY)
  const fmtDate = (iso: string | null) => {
    if (!iso) return '未保存'
    const d = new Date(iso)
    return (
      `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ` +
      `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    )
  }

  return (
    <div>
      <div className="fb-card">
        <div className="fb-card-head">
          <span style={{ fontSize: '1.4rem' }}>🟢</span>
          <span className="fb-card-title">リアルタイム共有（Supabase）</span>
          {conn === 'connected' ? (
            <span className="conn-badge conn-ok">接続中</span>
          ) : conn === 'connecting' ? (
            <span className="conn-badge conn-local">接続中...</span>
          ) : (
            <span className="conn-badge conn-err">未接続</span>
          )}
        </div>
        <div className="fb-steps">
          このアプリは <strong>Supabase</strong> をバックエンドに使用しています。データは全ての利用者間で
          <strong> リアルタイムに自動共有</strong> されます（手動接続は不要）。<br />
          接続情報は環境変数 <code>VITE_SUPABASE_URL</code> / <code>VITE_SUPABASE_ANON_KEY</code> で設定します。
          {conn === 'unconfigured' && (
            <>
              <br />
              <span style={{ color: 'var(--danger)' }}>
                ⚠ 環境変数が未設定です。.env（ローカル）または Vercel の Environment Variables を設定してください。
              </span>
            </>
          )}
          {conn === 'error' && (
            <>
              <br />
              <span style={{ color: 'var(--danger)' }}>⚠ 接続エラー: {errorMsg}</span>
            </>
          )}
        </div>
      </div>

      <div className="backup-grid">
        <div className="backup-card">
          <div className="backup-icon">💾</div>
          <div className="backup-card-title">全データを保存</div>
          <div className="backup-card-desc">
            すべての月のデータをJSONファイルとしてダウンロードします。定期的なバックアップやデータ移行にご利用ください。
          </div>
          <button className="btn btn-p" onClick={exportJson}>
            📥 JSONでダウンロード
          </button>
          <div className="backup-info-box">
            <div className="backup-info-row">
              <span className="backup-info-label">登録月数</span>
              <span className="backup-info-val">{monthCount}ヶ月</span>
            </div>
            <div className="backup-info-row">
              <span className="backup-info-label">総参加者数</span>
              <span className="backup-info-val">{totalAttendees}名</span>
            </div>
            <div className="backup-info-row">
              <span className="backup-info-label">データサイズ</span>
              <span className="backup-info-val">{sizeKB.toFixed(1)} KB</span>
            </div>
            <div className="backup-info-row">
              <span className="backup-info-label">最終バックアップ</span>
              <span className="backup-info-val" style={lastBackup ? undefined : { color: 'var(--danger)' }}>
                {fmtDate(lastBackup)}
              </span>
            </div>
          </div>
        </div>

        <div className="backup-card">
          <div className="backup-icon">📂</div>
          <div className="backup-card-title">データを復元</div>
          <div className="backup-card-desc">
            保存したJSONファイルからデータを復元します。<strong>現在のデータはすべて上書きされます。</strong>
            復元前に必ずバックアップを取ってください。
          </div>
          <button className="btn btn-s" onClick={() => fileRef.current?.click()}>
            📤 JSONから復元
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) importJson(f)
              e.target.value = ''
            }}
          />
        </div>
      </div>
    </div>
  )
}

import { useState, type ReactNode } from 'react'

const APP_PASSWORD = import.meta.env.VITE_APP_PASSWORD as string | undefined
const UNLOCK_KEY = 'meeting_unlocked_v1'

/**
 * 共有パスワードによる簡易アクセスゲート。
 * VITE_APP_PASSWORD が未設定の場合はゲートをスキップ（誰でも利用可）。
 * 注意: クライアント側判定のため強固な認証ではありません（社内利用想定の簡易ロック）。
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(
    () => !APP_PASSWORD || sessionStorage.getItem(UNLOCK_KEY) === '1',
  )
  const [input, setInput] = useState('')
  const [err, setErr] = useState(false)

  if (unlocked) return <>{children}</>

  const submit = () => {
    if (input === APP_PASSWORD) {
      sessionStorage.setItem(UNLOCK_KEY, '1')
      setUnlocked(true)
    } else {
      setErr(true)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">月例会 管理</div>
        <div className="auth-desc">共有パスワードを入力してください</div>
        <input
          type="password"
          className="auth-input"
          value={input}
          autoFocus
          onChange={(e) => {
            setInput(e.target.value)
            setErr(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
          placeholder="パスワード"
        />
        {err && <div className="auth-err">パスワードが違います</div>}
        <button className="btn btn-p" style={{ width: '100%', marginTop: 10 }} onClick={submit}>
          ログイン
        </button>
      </div>
    </div>
  )
}

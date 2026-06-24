import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && anonKey)

if (!isSupabaseConfigured) {
  // 開発時に気づけるよう警告（本番では .env を設定すること）
  console.warn(
    '[Supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY が未設定です。.env を確認してください。',
  )
}

// 未設定でもアプリが即クラッシュしないようダミー値でクライアントを生成。
// 実際の通信はエラーになるが、設定画面の案内が表示できる。
export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'placeholder-anon-key',
  {
    realtime: { params: { eventsPerSecond: 5 } },
  },
)

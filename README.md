# 月例会 管理システム（React + Supabase）

月例会の出席・参加費・ビジター来場回数・会員ランキング・グラフを管理する Web アプリです。
従来の単一 HTML 版を **React + TypeScript + Supabase** で再構築し、データはクラウド（Supabase）で
**全利用者にリアルタイム共有**されます。Vercel へのデプロイを想定しています。

> 旧 HTML 版は参照用に `_legacy/index.html` に保存してあります。

## 主な機能（旧版と同等）

- **出席リスト** … 月切替 / CSV・テキスト貼付インポート / エントリー数・実来場者数の集計 / 支払いステータス（PayPay・現金・無料・後日請求）/ 参加費設定（月別・種別別・ビジター来場回数別）/ 個別金額の上書き / 検索 / ドラッグで種別変更 / インライン編集 / 重複検出 / 手動追加 / CSV エクスポート / 月データ削除
- **ビジター来場回数** … 名前の一括登録 / 1回目・2回目・3回以上の集計
- **累計ランキング** … 会員マスタ（CSV インポート・手動追加・編集・削除）/ 年度別来場率
- **グラフ** … 月別参加人数の推移 / 会員参加率（総会員数の入力）
- **バックアップ** … JSON エクスポート / インポート（復元）

---

## セットアップ手順

### 1. Supabase プロジェクトを作成

1. <https://supabase.com> でプロジェクトを新規作成
2. ダッシュボードの **SQL Editor** を開き、[`supabase/schema.sql`](supabase/schema.sql) の中身を貼り付けて **Run**
   （テーブル 6 つ・RLS・リアルタイム配信が一括で設定されます）
3. **Project Settings → API** から以下をコピー
   - **Project URL**（`https://xxxx.supabase.co`）
   - **anon public key**

### 2. ローカルで動かす

```bash
npm install
copy .env.example .env   # mac/linux は cp
```

`.env` を編集：

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
VITE_APP_PASSWORD=好きな共有パスワード
```

```bash
npm run dev
```

ブラウザで <http://localhost:5173> を開き、共有パスワードを入力するとアプリが使えます。

### 3. GitHub に push

```bash
git init
git add .
git commit -m "Initial commit: React + Supabase 版"
git branch -M main
git remote add origin https://github.com/<ユーザー名>/<リポジトリ名>.git
git push -u origin main
```

> `.env` は `.gitignore` 済みのためコミットされません（秘密情報は push されません）。

### 4. Vercel にデプロイ

1. <https://vercel.com> で **Add New → Project**、上記の GitHub リポジトリを Import
2. Framework Preset は **Vite** が自動検出されます（ビルド設定の変更不要）
3. **Environment Variables** に次の 3 つを登録
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_APP_PASSWORD`
4. **Deploy** を押すと公開 URL が発行されます

以後、GitHub に push するたびに Vercel が自動で再デプロイします。

---

## アクセス制御について

- 起動時に **共有パスワード**（`VITE_APP_PASSWORD`）の入力を求めます。これを知っている人だけが操作できます。
- これはクライアント側の簡易ロックです（社内・限定 URL での運用を想定）。より厳密な認証が必要になった場合は
  Supabase Auth（メールログイン等）への移行を検討してください。
- データベースは anon キーでの読み書きを許可しています（RLS は全許可）。URL とキーを公開しないでください。

## 技術スタック

| 項目 | 採用技術 |
| --- | --- |
| フロントエンド | React 18 + TypeScript + Vite |
| バックエンド / DB | Supabase (PostgreSQL + Realtime) |
| ホスティング | Vercel |

## スクリプト

```bash
npm run dev      # 開発サーバー
npm run build    # 型チェック + 本番ビルド（dist/ に出力）
npm run preview  # ビルド結果をローカル確認
npm run lint     # 型チェックのみ
```

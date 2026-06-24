-- =====================================================================
--  月例会 管理システム — Supabase スキーマ
--  Supabase ダッシュボード > SQL Editor に貼り付けて「Run」してください。
--  （何度実行しても安全な冪等スクリプトです）
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. attendees : 各月の出席者（出席リストの1行）
--    type: '正会員' | 'ビジター' | '支援機関' | '学生'
-- ---------------------------------------------------------------------
create table if not exists public.attendees (
  id         uuid primary key default gen_random_uuid(),
  month      text        not null,                 -- 'YYYY-MM'
  name       text        not null,
  kana       text        not null default '',
  company    text        not null default '',
  industry   text        not null default '',
  type       text        not null default '正会員',
  email      text        not null default '',
  manual     boolean     not null default false,    -- 手動追加（エントリー数に含めない）
  created_at timestamptz not null default now()
);
create index if not exists attendees_month_idx on public.attendees (month);

-- ---------------------------------------------------------------------
-- 2. statuses : 支払い／出欠ステータス（月 × 正規化名 で一意）
--    status: '' | 'paypay' | 'cash' | 'free' | 'invoice'
-- ---------------------------------------------------------------------
create table if not exists public.statuses (
  month     text not null,
  norm_name text not null,
  status    text not null default '',
  primary key (month, norm_name)
);

-- ---------------------------------------------------------------------
-- 3. fees : 月別の参加費設定
-- ---------------------------------------------------------------------
create table if not exists public.fees (
  month   text primary key,                          -- 'YYYY-MM'
  member  integer not null default 4000,
  v1      integer not null default 4000,
  v2      integer not null default 4000,
  v3plus  integer not null default 10000,
  support integer not null default 4000,
  student integer not null default 0
);

-- ---------------------------------------------------------------------
-- 4. person_fees : 個人別の金額上書き（月 × 正規化名）
-- ---------------------------------------------------------------------
create table if not exists public.person_fees (
  month     text    not null,
  norm_name text    not null,
  amount    integer not null,
  primary key (month, norm_name)
);

-- ---------------------------------------------------------------------
-- 5. members : 全会員マスタ（ランキング用）
-- ---------------------------------------------------------------------
create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  kana        text not null default '',
  company     text not null default '',
  member_type text not null default '',
  join_date   text not null default ''
);

-- ---------------------------------------------------------------------
-- 6. member_counts : 月別の総会員数（参加率グラフの分母）
-- ---------------------------------------------------------------------
create table if not exists public.member_counts (
  month text primary key,
  count integer not null default 0
);

-- =====================================================================
--  Row Level Security
--  共有パスワード方式のため、anon ロールに全操作を許可します。
--  （アクセス制限はアプリ側のパスワードゲートで行います）
-- =====================================================================
alter table public.attendees     enable row level security;
alter table public.statuses      enable row level security;
alter table public.fees          enable row level security;
alter table public.person_fees   enable row level security;
alter table public.members       enable row level security;
alter table public.member_counts enable row level security;

do $$
declare t text;
begin
  foreach t in array array['attendees','statuses','fees','person_fees','members','member_counts']
  loop
    execute format('drop policy if exists "anon full access" on public.%I;', t);
    execute format(
      'create policy "anon full access" on public.%I for all to anon, authenticated using (true) with check (true);',
      t
    );
  end loop;
end$$;

-- =====================================================================
--  Realtime : 変更をリアルタイムに全クライアントへ配信
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['attendees','statuses','fees','person_fees','members','member_counts']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I;', t);
    exception when duplicate_object then
      -- 既に追加済みなら無視
      null;
    end;
  end loop;
end$$;

import type { AttendeeType, FeeSet, StatusValue } from './types'

// ---- MONTHS ----
function genMonths(startY: number, startM: number): string[] {
  const months: string[] = []
  let y = startY
  let m = startM
  const now = new Date()
  const endY = now.getFullYear() + 3
  while (y < endY) {
    months.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return months
}

export function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-')
  return `${y}年${parseInt(m, 10)}月`
}

/** ビジター来場回数・ランキング計算用（2025年4月〜） */
export const ALL_MONTHS = genMonths(2025, 4)
/** 出席リスト ナビゲーション用（2025年4月〜） */
export const NAV_MONTHS = genMonths(2025, 4)
/** グラフ表示用（2026年4月〜） */
export const GRAPH_MONTHS = genMonths(2026, 4)

export function currentMonthDefault(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// ---- STATUS ----
export const STATUS_OPTIONS: { val: StatusValue; label: string }[] = [
  { val: '', label: '─' },
  { val: 'paypay', label: 'PAYPAY決済済' },
  { val: 'cash', label: '現金決済済' },
  { val: 'free', label: '無料' },
  { val: 'invoice', label: '後日請求' },
]

export function isActualStatus(st: StatusValue | string): boolean {
  return st === 'paypay' || st === 'cash' || st === 'free' || st === 'invoice'
}

// ---- FEES ----
export const DEFAULT_FEES: FeeSet = {
  member: 4000,
  v1: 4000,
  v2: 4000,
  v3plus: 10000,
  support: 4000,
  student: 0,
}

// ---- CATEGORIES ----
export const CATEGORIES: AttendeeType[] = ['正会員', 'ビジター', '支援機関', '学生']
export const CATEGORY_CLASS: Record<AttendeeType, string> = {
  正会員: 'member',
  ビジター: 'visitor',
  支援機関: 'support',
  学生: 'student',
}

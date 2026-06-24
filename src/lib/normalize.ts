import type { AttendeeType, StatusValue } from './types'

// 異体字・旧字体を標準字体に統一するマップ（旧アプリから移植）
const KANJI_NORM: Record<string, string> = {
  髙: '高', 眞: '真', 濵: '浜', 濱: '浜', '﨑': '崎', 塚: '塚',
  德: '徳', 黑: '黒', 國: '国', 號: '号', 廣: '広', 學: '学',
  體: '体', 澤: '沢',
}

/** 氏名を正規化（空白除去 + 異体字統一）。ステータス・金額のキーに使う。 */
export function normName(s: string | null | undefined): string {
  let r = (s ?? '').replace(/[\s　\t]/g, '')
  for (const [v, n] of Object.entries(KANJI_NORM)) {
    r = r.split(v).join(n)
  }
  return r
}

/** 会員種別の文字列を4分類に正規化（旧アプリから移植） */
export function normalizeType(raw: string): AttendeeType {
  if (/ビジター/.test(raw)) return 'ビジター'
  if (/学生/.test(raw)) return '学生'
  if (/支援|行政|金融|大学/.test(raw)) return '支援機関'
  if (/正会員|会員/.test(raw)) return '正会員'
  return (raw as AttendeeType) || '正会員'
}

export function statusKey(ym: string, name: string): string {
  return `${ym}:${normName(name)}`
}

export function statusClass(val: StatusValue | string): string {
  return (
    ({ paypay: 'paypay', cash: 'cash', free: 'free', invoice: 'invoice' } as Record<string, string>)[
      val
    ] || 'unset'
  )
}

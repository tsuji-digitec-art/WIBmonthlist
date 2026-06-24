import { ALL_MONTHS, DEFAULT_FEES } from './constants'
import { normName, statusKey } from './normalize'
import type { AppState, Attendee, FeeSet, Member, StatusValue } from './types'

// ---- STATUS / FEE ACCESSORS ----
export function getStatus(state: AppState, ym: string, name: string): StatusValue {
  return state.statuses[statusKey(ym, name)] || ''
}

export function getFees(state: AppState, ym: string): FeeSet {
  return state.fees[ym] ? { ...DEFAULT_FEES, ...state.fees[ym] } : { ...DEFAULT_FEES }
}

export function getPersonFee(state: AppState, ym: string, nn: string): number | null {
  const v = state.personFees[`${ym}:${nn}`]
  return v !== undefined ? v : null
}

export function isOverridden(state: AppState, ym: string, nn: string): boolean {
  return getPersonFee(state, ym, nn) !== null
}

// ---- MASTER ----
export function getMasterMember(state: AppState, nn: string): Member | null {
  return state.members.find((m) => normName(m.name) === nn) || null
}

export function isStudentMember(state: AppState, nn: string): boolean {
  const m = getMasterMember(state, nn)
  return m ? /学生/.test(m.memberType) : false
}

// ---- VISITOR COUNTS ----
/** upToMonth までに登場したビジターの累積来場回数（normName -> 回数） */
export function calcVisitorCounts(state: AppState, upToMonth: string): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const ym of ALL_MONTHS) {
    if (ym > upToMonth) break
    for (const a of state.attendees[ym] || []) {
      if (a.type === 'ビジター') {
        const k = normName(a.name)
        counts[k] = (counts[k] || 0) + 1
      }
    }
  }
  return counts
}

export interface VisitorInfo {
  name: string
  kana: string
  company: string
  count: number
  months: string[]
}

export function allVisitorInfo(state: AppState): Record<string, VisitorInfo> {
  const info: Record<string, VisitorInfo> = {}
  for (const ym of ALL_MONTHS) {
    for (const a of state.attendees[ym] || []) {
      if (a.type === 'ビジター') {
        const k = normName(a.name)
        if (!info[k]) info[k] = { name: a.name, kana: a.kana, company: a.company, count: 0, months: [] }
        info[k].count++
        info[k].months.push(ym)
      }
    }
  }
  return info
}

// ---- FEES ----
export function defaultFeeForAttendee(
  state: AppState,
  ym: string,
  a: Attendee,
  visitorCounts: Record<string, number>,
): number {
  const f = getFees(state, ym)
  if (a.type === '正会員') return f.member
  if (a.type === '支援機関') return f.support
  if (a.type === '学生') return f.student
  if (a.type === 'ビジター') {
    const vc = visitorCounts[normName(a.name)] || 1
    if (vc === 1) return f.v1
    if (vc === 2) return f.v2
    return f.v3plus
  }
  return 0
}

export function feeForAttendee(
  state: AppState,
  ym: string,
  a: Attendee,
  visitorCounts: Record<string, number>,
): number {
  const st = getStatus(state, ym, a.name)
  if (st === 'free') return 0
  if (isStudentMember(state, normName(a.name))) return 0
  const override = getPersonFee(state, ym, normName(a.name))
  return override !== null ? override : defaultFeeForAttendee(state, ym, a, visitorCounts)
}

// ---- FISCAL YEAR ----
/** 当該年度の経過月数（4月=1, 5月=2 … 3月=12） */
export function fyElapsedMonths(fy: number): number {
  const now = new Date()
  const curY = now.getFullYear()
  const curM = now.getMonth() + 1
  const curFY = curM >= 4 ? curY : curY - 1
  if (fy > curFY) return 0
  if (fy < curFY) return 12
  return curM >= 4 ? curM - 3 : curM + 9
}

export function getFiscalYear(ym: string): number {
  const [y, m] = ym.split('-').map(Number)
  return m >= 4 ? y : y - 1
}

export interface RankingEntry {
  name: string
  kana: string
  company: string
  memberType: string
  joinDate?: string
  fy: Record<number, number>
  total: number
}

export function memberRankingData(state: AppState): {
  entries: RankingEntry[]
  fiscalYears: number[]
} {
  const masters = state.members
  const fySet = new Set<number>()

  const attMap: Record<string, { name: string; kana: string; fy: Record<number, number>; total: number }> = {}
  for (const ym of ALL_MONTHS) {
    const fy = getFiscalYear(ym)
    for (const a of state.attendees[ym] || []) {
      if (a.type === 'ビジター') continue
      const k = normName(a.name)
      const st = getStatus(state, ym, a.name)
      const studentMember = isStudentMember(state, k)
      const counted = st === 'paypay' || st === 'cash' || (studentMember && st === 'free')
      if (!counted) continue
      if (masters.length > 0 && !getMasterMember(state, k)) continue
      if (!attMap[k]) attMap[k] = { name: a.name, kana: a.kana, fy: {}, total: 0 }
      attMap[k].fy[fy] = (attMap[k].fy[fy] || 0) + 1
      attMap[k].total++
      fySet.add(fy)
    }
  }
  Object.values(attMap).forEach((v) => Object.keys(v.fy).forEach((fy) => fySet.add(parseInt(fy, 10))))

  let entries: RankingEntry[]
  if (masters.length > 0) {
    entries = masters.map((m) => {
      const k = normName(m.name)
      const att = attMap[k] || { fy: {}, total: 0, kana: '' }
      return {
        name: m.name,
        kana: m.kana || att.kana || '',
        company: m.company || '',
        memberType: m.memberType,
        joinDate: m.joinDate,
        fy: att.fy,
        total: att.total,
      }
    })
  } else {
    entries = Object.values(attMap).map((v) => ({ ...v, company: '', memberType: '' }))
  }

  entries.sort((a, b) => b.total - a.total || (a.kana || a.name).localeCompare(b.kana || b.name, 'ja'))
  return { entries, fiscalYears: [...fySet].sort((a, b) => a - b) }
}

export type AttendeeType = '正会員' | 'ビジター' | '支援機関' | '学生'

export type StatusValue = '' | 'paypay' | 'cash' | 'free' | 'invoice'

export interface Attendee {
  id: string
  month: string
  name: string
  kana: string
  company: string
  industry: string
  type: AttendeeType
  email: string
  manual: boolean
}

/** インポート時など、まだ id が無い出席者 */
export type NewAttendee = Omit<Attendee, 'id' | 'month'>

export interface FeeSet {
  member: number
  v1: number
  v2: number
  v3plus: number
  support: number
  student: number
}

export interface Member {
  id: string
  name: string
  kana: string
  company: string
  memberType: string
  joinDate: string
}

export type NewMember = Omit<Member, 'id'>

/** アプリ全体のインメモリ状態（旧 localStorage のキャッシュ相当） */
export interface AppState {
  /** month -> 出席者配列 */
  attendees: Record<string, Attendee[]>
  /** "month:normName" -> ステータス */
  statuses: Record<string, StatusValue>
  /** month -> 参加費設定 */
  fees: Record<string, FeeSet>
  /** "month:normName" -> 上書き金額 */
  personFees: Record<string, number>
  /** 全会員マスタ */
  members: Member[]
  /** month -> 総会員数 */
  memberCounts: Record<string, number>
}

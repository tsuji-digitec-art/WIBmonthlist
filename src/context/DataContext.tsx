import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { normName } from '../lib/normalize'
import type {
  AppState,
  Attendee,
  AttendeeType,
  FeeSet,
  Member,
  NewAttendee,
  NewMember,
  StatusValue,
} from '../lib/types'

const EMPTY_STATE: AppState = {
  attendees: {},
  statuses: {},
  fees: {},
  personFees: {},
  members: [],
  memberCounts: {},
}

export type ConnState = 'connecting' | 'connected' | 'error' | 'unconfigured'

interface DataContextValue {
  state: AppState
  conn: ConnState
  errorMsg: string
  refetch: () => Promise<void>
  // attendees
  addAttendees: (month: string, list: NewAttendee[]) => Promise<{ added: number; skipped: number }>
  addAttendee: (month: string, a: NewAttendee) => Promise<boolean>
  updateAttendee: (id: string, patch: Partial<Attendee>, prevName?: string) => Promise<void>
  changeAttendeeType: (id: string, toType: AttendeeType) => Promise<void>
  removeAttendee: (id: string) => Promise<void>
  deleteMonth: (month: string) => Promise<void>
  // statuses / fees
  setStatus: (month: string, name: string, val: StatusValue) => Promise<void>
  setPersonFee: (month: string, nn: string, amount: number) => Promise<void>
  resetPersonFee: (month: string, nn: string) => Promise<void>
  saveFees: (month: string, fees: FeeSet) => Promise<void>
  // members
  setMembers: (members: NewMember[]) => Promise<void>
  addMember: (m: NewMember) => Promise<boolean>
  updateMember: (id: string, patch: Partial<Member>) => Promise<void>
  removeMember: (id: string) => Promise<void>
  clearMembers: () => Promise<void>
  // member counts
  saveMemberCounts: (counts: Record<string, number>) => Promise<void>
  // backup
  restoreBackup: (data: Record<string, NewAttendee[]>, statuses: Record<string, StatusValue>) => Promise<void>
}

const DataContext = createContext<DataContextValue | null>(null)

export function useData(): DataContextValue {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(EMPTY_STATE)
  const [conn, setConn] = useState<ConnState>(isSupabaseConfigured ? 'connecting' : 'unconfigured')
  const [errorMsg, setErrorMsg] = useState('')
  const stateRef = useRef(state)
  stateRef.current = state

  // -------- FETCH ALL --------
  const fetchAll = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setConn('unconfigured')
      return
    }
    try {
      const [att, sts, fee, pfee, mem, mc] = await Promise.all([
        supabase.from('attendees').select('*'),
        supabase.from('statuses').select('*'),
        supabase.from('fees').select('*'),
        supabase.from('person_fees').select('*'),
        supabase.from('members').select('*'),
        supabase.from('member_counts').select('*'),
      ])
      const firstErr = att.error || sts.error || fee.error || pfee.error || mem.error || mc.error
      if (firstErr) throw firstErr

      const attendees: Record<string, Attendee[]> = {}
      for (const r of att.data || []) {
        const a: Attendee = {
          id: r.id,
          month: r.month,
          name: r.name,
          kana: r.kana ?? '',
          company: r.company ?? '',
          industry: r.industry ?? '',
          type: r.type as AttendeeType,
          email: r.email ?? '',
          manual: !!r.manual,
        }
        ;(attendees[a.month] ||= []).push(a)
      }

      const statuses: Record<string, StatusValue> = {}
      for (const r of sts.data || []) statuses[`${r.month}:${r.norm_name}`] = r.status as StatusValue

      const fees: Record<string, FeeSet> = {}
      for (const r of fee.data || [])
        fees[r.month] = {
          member: r.member, v1: r.v1, v2: r.v2, v3plus: r.v3plus, support: r.support, student: r.student,
        }

      const personFees: Record<string, number> = {}
      for (const r of pfee.data || []) personFees[`${r.month}:${r.norm_name}`] = r.amount

      const members: Member[] = (mem.data || []).map((r) => ({
        id: r.id,
        name: r.name,
        kana: r.kana ?? '',
        company: r.company ?? '',
        memberType: r.member_type ?? '',
        joinDate: r.join_date ?? '',
      }))

      const memberCounts: Record<string, number> = {}
      for (const r of mc.data || []) memberCounts[r.month] = r.count

      setState({ attendees, statuses, fees, personFees, members, memberCounts })
      setConn('connected')
      setErrorMsg('')
    } catch (e) {
      setConn('error')
      setErrorMsg(e instanceof Error ? e.message : String(e))
    }
  }, [])

  // -------- INITIAL LOAD + REALTIME --------
  useEffect(() => {
    if (!isSupabaseConfigured) return
    void fetchAll()

    let timer: ReturnType<typeof setTimeout> | null = null
    const debouncedRefetch = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void fetchAll(), 400)
    }

    const channel = supabase
      .channel('app-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public' }, debouncedRefetch)
      .subscribe()

    return () => {
      if (timer) clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [fetchAll])

  // ============ MUTATIONS ============
  // 各操作: Supabase へ書き込み → realtime が全クライアントへ反映（自分自身も refetch される）。
  // 体感速度のため、ここでは書き込み成功後に refetch を呼ばず realtime に任せるが、
  // realtime 未達のケースに備え失敗時はそのまま例外を投げる。

  const addAttendees = useCallback(
    async (month: string, list: NewAttendee[]) => {
      const existing = stateRef.current.attendees[month] || []
      const existingKeys = new Set(existing.map((a) => normName(a.name) + '|' + a.type))
      const newOnes = list.filter((a) => !existingKeys.has(normName(a.name) + '|' + a.type))
      const skipped = list.length - newOnes.length
      if (newOnes.length > 0) {
        const { error } = await supabase
          .from('attendees')
          .insert(newOnes.map((a) => ({ ...a, month })))
        if (error) throw error
        await fetchAll()
      }
      return { added: newOnes.length, skipped }
    },
    [fetchAll],
  )

  const addAttendee = useCallback(
    async (month: string, a: NewAttendee) => {
      const existing = stateRef.current.attendees[month] || []
      if (existing.some((x) => normName(x.name) === normName(a.name) && x.type === a.type)) {
        return false
      }
      const { error } = await supabase.from('attendees').insert([{ ...a, month }])
      if (error) throw error
      await fetchAll()
      return true
    },
    [fetchAll],
  )

  const migrateStatusKey = useCallback(async (month: string, oldNorm: string, newNorm: string) => {
    if (oldNorm === newNorm) return
    const oldVal = stateRef.current.statuses[`${month}:${oldNorm}`]
    if (oldVal !== undefined && oldVal !== '') {
      await supabase.from('statuses').upsert({ month, norm_name: newNorm, status: oldVal })
    }
    await supabase.from('statuses').delete().match({ month, norm_name: oldNorm })
    // 個人金額も移行
    const oldFee = stateRef.current.personFees[`${month}:${oldNorm}`]
    if (oldFee !== undefined) {
      await supabase.from('person_fees').upsert({ month, norm_name: newNorm, amount: oldFee })
      await supabase.from('person_fees').delete().match({ month, norm_name: oldNorm })
    }
  }, [])

  const updateAttendee = useCallback(
    async (id: string, patch: Partial<Attendee>, prevName?: string) => {
      const dbPatch: Record<string, unknown> = {}
      for (const k of ['name', 'kana', 'company', 'industry', 'type', 'email'] as const) {
        if (patch[k] !== undefined) dbPatch[k] = patch[k]
      }
      const row = Object.values(stateRef.current.attendees)
        .flat()
        .find((a) => a.id === id)
      const month = row?.month
      if (month && prevName !== undefined && patch.name !== undefined) {
        await migrateStatusKey(month, normName(prevName), normName(patch.name))
      }
      const { error } = await supabase.from('attendees').update(dbPatch).eq('id', id)
      if (error) throw error
      await fetchAll()
    },
    [fetchAll, migrateStatusKey],
  )

  const changeAttendeeType = useCallback(
    async (id: string, toType: AttendeeType) => {
      const { error } = await supabase.from('attendees').update({ type: toType }).eq('id', id)
      if (error) throw error
      await fetchAll()
    },
    [fetchAll],
  )

  const removeAttendee = useCallback(
    async (id: string) => {
      const { error } = await supabase.from('attendees').delete().eq('id', id)
      if (error) throw error
      await fetchAll()
    },
    [fetchAll],
  )

  const deleteMonth = useCallback(
    async (month: string) => {
      const { error } = await supabase.from('attendees').delete().eq('month', month)
      if (error) throw error
      await fetchAll()
    },
    [fetchAll],
  )

  const setStatus = useCallback(
    async (month: string, name: string, val: StatusValue) => {
      const nn = normName(name)
      const { error } = await supabase
        .from('statuses')
        .upsert({ month, norm_name: nn, status: val }, { onConflict: 'month,norm_name' })
      if (error) throw error
      await fetchAll()
    },
    [fetchAll],
  )

  const setPersonFee = useCallback(
    async (month: string, nn: string, amount: number) => {
      const { error } = await supabase
        .from('person_fees')
        .upsert({ month, norm_name: nn, amount }, { onConflict: 'month,norm_name' })
      if (error) throw error
      await fetchAll()
    },
    [fetchAll],
  )

  const resetPersonFee = useCallback(
    async (month: string, nn: string) => {
      const { error } = await supabase.from('person_fees').delete().match({ month, norm_name: nn })
      if (error) throw error
      await fetchAll()
    },
    [fetchAll],
  )

  const saveFees = useCallback(
    async (month: string, fees: FeeSet) => {
      const { error } = await supabase.from('fees').upsert({ month, ...fees }, { onConflict: 'month' })
      if (error) throw error
      await fetchAll()
    },
    [fetchAll],
  )

  const memberToRow = (m: NewMember) => ({
    name: m.name,
    kana: m.kana,
    company: m.company,
    member_type: m.memberType,
    join_date: m.joinDate,
  })

  const setMembers = useCallback(
    async (members: NewMember[]) => {
      // 全置換
      await supabase.from('members').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      if (members.length > 0) {
        const { error } = await supabase.from('members').insert(members.map(memberToRow))
        if (error) throw error
      }
      await fetchAll()
    },
    [fetchAll],
  )

  const addMember = useCallback(
    async (m: NewMember) => {
      if (stateRef.current.members.some((x) => normName(x.name) === normName(m.name))) return false
      const { error } = await supabase.from('members').insert([memberToRow(m)])
      if (error) throw error
      await fetchAll()
      return true
    },
    [fetchAll],
  )

  const updateMember = useCallback(
    async (id: string, patch: Partial<Member>) => {
      const dbPatch: Record<string, unknown> = {}
      if (patch.name !== undefined) dbPatch.name = patch.name
      if (patch.kana !== undefined) dbPatch.kana = patch.kana
      if (patch.company !== undefined) dbPatch.company = patch.company
      if (patch.memberType !== undefined) dbPatch.member_type = patch.memberType
      if (patch.joinDate !== undefined) dbPatch.join_date = patch.joinDate
      const { error } = await supabase.from('members').update(dbPatch).eq('id', id)
      if (error) throw error
      await fetchAll()
    },
    [fetchAll],
  )

  const removeMember = useCallback(
    async (id: string) => {
      const { error } = await supabase.from('members').delete().eq('id', id)
      if (error) throw error
      await fetchAll()
    },
    [fetchAll],
  )

  const clearMembers = useCallback(async () => {
    await supabase.from('members').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await fetchAll()
  }, [fetchAll])

  const saveMemberCounts = useCallback(
    async (counts: Record<string, number>) => {
      const rows = Object.entries(counts).map(([month, count]) => ({ month, count }))
      // 既存を消してから入れ直し（0や削除も反映）
      await supabase.from('member_counts').delete().neq('month', '____none____')
      if (rows.length > 0) {
        const { error } = await supabase.from('member_counts').insert(rows)
        if (error) throw error
      }
      await fetchAll()
    },
    [fetchAll],
  )

  const restoreBackup = useCallback(
    async (data: Record<string, NewAttendee[]>, statuses: Record<string, StatusValue>) => {
      // 全 attendees を置換
      await supabase.from('attendees').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      const allRows: Record<string, unknown>[] = []
      for (const [month, list] of Object.entries(data)) {
        for (const a of list) {
          allRows.push({
            month,
            name: a.name,
            kana: a.kana ?? '',
            company: a.company ?? '',
            industry: a.industry ?? '',
            type: a.type ?? '正会員',
            email: a.email ?? '',
            manual: !!a.manual,
          })
        }
      }
      if (allRows.length > 0) {
        const { error } = await supabase.from('attendees').insert(allRows)
        if (error) throw error
      }
      // statuses を置換
      await supabase.from('statuses').delete().neq('month', '____none____')
      const stRows = Object.entries(statuses)
        .filter(([, v]) => v)
        .map(([key, status]) => {
          const idx = key.indexOf(':')
          return { month: key.slice(0, idx), norm_name: key.slice(idx + 1), status }
        })
      if (stRows.length > 0) {
        const { error } = await supabase.from('statuses').upsert(stRows, { onConflict: 'month,norm_name' })
        if (error) throw error
      }
      await fetchAll()
    },
    [fetchAll],
  )

  const value = useMemo<DataContextValue>(
    () => ({
      state,
      conn,
      errorMsg,
      refetch: fetchAll,
      addAttendees,
      addAttendee,
      updateAttendee,
      changeAttendeeType,
      removeAttendee,
      deleteMonth,
      setStatus,
      setPersonFee,
      resetPersonFee,
      saveFees,
      setMembers,
      addMember,
      updateMember,
      removeMember,
      clearMembers,
      saveMemberCounts,
      restoreBackup,
    }),
    [
      state, conn, errorMsg, fetchAll, addAttendees, addAttendee, updateAttendee, changeAttendeeType,
      removeAttendee, deleteMonth, setStatus, setPersonFee, resetPersonFee, saveFees, setMembers,
      addMember, updateMember, removeMember, clearMembers, saveMemberCounts, restoreBackup,
    ],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

// CSV / TSV パースユーティリティ（旧アプリから移植）

/** ArrayBuffer をエンコーディング自動判定でデコード（BOM / UTF-8 / Shift_JIS） */
export function decodeBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes)
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    /* fallthrough */
  }
  try {
    return new TextDecoder('shift_jis').decode(bytes)
  } catch {
    /* fallthrough */
  }
  return new TextDecoder('utf-8').decode(bytes)
}

/** クオート対応の CSV/TSV パーサ。2次元配列を返す。 */
export function parseCsvFull(text: string, delim: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQ = false
        }
      } else {
        cur += c
      }
    } else {
      if (c === '"') inQ = true
      else if (c === delim) {
        row.push(cur)
        cur = ''
      } else if (c === '\r') {
        /* skip */
      } else if (c === '\n') {
        row.push(cur)
        rows.push(row)
        row = []
        cur = ''
      } else cur += c
    }
  }
  if (cur !== '' || row.length > 0) {
    row.push(cur)
    rows.push(row)
  }
  return rows
}

/** ファイルを読み込んでテキスト（BOM除去済み）にして返す */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = decodeBuffer(e.target!.result as ArrayBuffer)
      resolve(text.replace(/^﻿/, ''))
    }
    reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました。'))
    reader.readAsArrayBuffer(file)
  })
}

/** CSV ダウンロードを発火（BOM付きUTF-8） */
export function downloadCsv(filename: string, rows: (string | number)[][]): void {
  const csv = '﻿' + rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadJson(filename: string, obj: unknown): void {
  const json = JSON.stringify(obj, null, 2)
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

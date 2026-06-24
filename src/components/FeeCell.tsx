interface FeeCellProps {
  fee: number
  overridden: boolean
  disabled: boolean
  onCommit: (v: number) => void
  onReset: () => void
}

/** 一覧の金額セル（インライン編集可能・ダブルクリックでデフォルトに戻す） */
export function FeeCell({ fee, overridden, disabled, onCommit, onReset }: FeeCellProps) {
  const title = overridden ? '個別設定中（ダブルクリックでリセット）' : 'デフォルト金額（編集可）'
  return (
    <input
      // fee が外部要因で変わったら入力もリセットしたいので key に fee を含める
      key={fee}
      type="number"
      className={`fee-cell${overridden && !disabled ? ' overridden' : ''}`}
      defaultValue={fee}
      min={0}
      disabled={disabled}
      title={title}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
      onBlur={(e) => {
        const v = parseInt(e.currentTarget.value, 10)
        if (!isNaN(v) && v >= 0 && v !== fee) onCommit(v)
      }}
      onDoubleClick={onReset}
    />
  )
}

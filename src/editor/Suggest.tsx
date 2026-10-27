import { Combobox, type ComboOption } from '@/components/combobox'

export type Suggestion = ComboOption

/**
 * Picks one of the suggestions (the button shows its name, not the stored value). Text typed
 * that isn't suggested can be kept too: naming the thing is optional.
 */
export function SuggestInput({
  value,
  onChange,
  suggestions,
  placeholder,
}: {
  value: string | null
  onChange: (v: string | null) => void
  suggestions: Suggestion[]
  placeholder?: string
}) {
  return <Combobox className="w-full" options={suggestions} value={value} onChange={onChange} placeholder={placeholder} search={placeholder} free={(t) => `Use “${t}”`} clearable />
}

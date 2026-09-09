export function displayFinalWithTone(
  value: string,
  tonePosition: number,
  tone: number,
  useNumberTone: boolean,
): string {
  // A dotless i only makes sense when an actual tone mark will replace its dot.
  if (!useNumberTone && tone > 0 && value[tonePosition] === 'i')
    return `${value.slice(0, tonePosition)}ı${value.slice(tonePosition + 1)}`
  return value
}

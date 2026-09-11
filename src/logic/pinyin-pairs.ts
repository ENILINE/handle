import rawPairs from '../data/pinyin_pairs.json'

export const NULL_INITIAL = 'null'

const pairs = rawPairs as [string, string][]
const initialsByFinal = new Map<string, string[]>()
const finalsByInitial = new Map<string, string[]>()

for (const [initial, final] of pairs) {
  const initials = initialsByFinal.get(final) || []
  initials.push(initial)
  initialsByFinal.set(final, initials)

  const finals = finalsByInitial.get(initial) || []
  finals.push(final)
  finalsByInitial.set(initial, finals)
}

export function getInitialsForFinal(final: string): readonly string[] {
  return initialsByFinal.get(final) || []
}

export function getFinalsForInitial(initial: string): readonly string[] {
  return finalsByInitial.get(initial) || []
}

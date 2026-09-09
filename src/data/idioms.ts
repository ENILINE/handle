import index from './idiom_index.json'

export interface IdiomInfo {
  explanation: string
  derivation: string
  example: string
}

type IndexData = Record<string, string>
type IdiomDataFile = Record<string, { e: string; d: string; x: string }>

const cache = new Map<string, IdiomDataFile>()

async function loadFile(bucketId: string): Promise<IdiomDataFile> {
  if (cache.has(bucketId))
    return cache.get(bucketId)!
  const data = await fetch(`${import.meta.env.BASE_URL}idiom-data/idiom_${bucketId}.json`).then(r => r.json()) as IdiomDataFile
  cache.set(bucketId, data)
  return data
}

// Manual overrides for one-off additions without rebuilding the whole dataset.
// Add entries here when you need to quickly add or fix an idiom's explanation data.
const overrides: Record<string, IdiomInfo> = {
  // Example:
  // '一心一意': { explanation: '...', derivation: '...', example: '...' },
}

export async function getIdiomInfo(word: string): Promise<IdiomInfo | undefined> {
  const override = overrides[word]
  if (override)
    return override

  const bucketId = (index as IndexData)[word[0]]
  if (!bucketId)
    return undefined
  const file = await loadFile(bucketId)
  const entry = file[word]
  if (!entry)
    return undefined
  return {
    explanation: entry.e,
    derivation: entry.d,
    example: entry.x,
  }
}

export function getIdiomInfoSync(word: string): IdiomInfo | undefined {
  const override = overrides[word]
  if (override)
    return override

  const bucketId = (index as IndexData)[word[0]]
  if (!bucketId)
    return undefined
  const file = cache.get(bucketId)
  if (!file)
    return undefined
  const entry = file[word]
  if (!entry)
    return undefined
  return {
    explanation: entry.e,
    derivation: entry.d,
    example: entry.x,
  }
}

export function isIdiomCached(word: string): boolean {
  const bucketId = (index as IndexData)[word[0]]
  if (!bucketId)
    return true // no file means no data, treat as "cached" (nothing to load)
  return cache.has(bucketId)
}

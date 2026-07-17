import index from './idiom_index.json'

export interface IdiomInfo {
  explanation: string
  derivation: string
  example: string
}

type IndexData = Record<string, string>
type IdiomDataFile = Record<string, { e: string; d: string; x: string }>

const cache = new Map<string, IdiomDataFile>()

async function loadFile(name: string): Promise<IdiomDataFile> {
  if (cache.has(name))
    return cache.get(name)!
  const data = await fetch(`/idioms/${name}`).then(r => r.json()) as IdiomDataFile
  cache.set(name, data)
  return data
}

export async function getIdiomInfo(word: string): Promise<IdiomInfo | undefined> {
  const firstChar = word[0]
  const fileName = (index as IndexData)[firstChar]
  if (!fileName)
    return undefined
  const file = await loadFile(fileName)
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
  const firstChar = word[0]
  const fileName = (index as IndexData)[firstChar]
  if (!fileName)
    return undefined
  const file = cache.get(fileName)
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
  const fileName = (index as IndexData)[word[0]]
  if (!fileName)
    return true // no file means no data, treat as "cached" (nothing to load)
  return cache.has(fileName)
}
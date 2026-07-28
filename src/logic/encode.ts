import type { CustomPayload } from './types'

const XOR_KEY = 'handle'

export function encodeCustom(payload: CustomPayload): string {
  const json = JSON.stringify(payload)
  const bytes = new TextEncoder().encode(json)
  const key = new TextEncoder().encode(XOR_KEY)
  const xored = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++)
    xored[i] = bytes[i] ^ key[i % key.length]
  let binary = ''
  for (let i = 0; i < xored.length; i++)
    binary += String.fromCharCode(xored[i])
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

export function decodeCustom(encoded: string): CustomPayload | null {
  try {
    let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    while (base64.length % 4)
      base64 += '='
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++)
      bytes[i] = binary.charCodeAt(i)
    const key = new TextEncoder().encode(XOR_KEY)
    const decoded = new Uint8Array(bytes.length)
    for (let i = 0; i < bytes.length; i++)
      decoded[i] = bytes[i] ^ key[i % key.length]
    return JSON.parse(new TextDecoder().decode(decoded))
  }
  catch {
    return null
  }
}
import { supabase } from './supabase'

const FALLBACK: string[] = [
  'Bundesliga', 'La Liga', 'Ligue 1',
  'Premier League', 'Liga Italiana', 'Selecciones'
]

let cache: { value: string[]; expiresAt: number } | null = null
const TTL_MS = 60_000

export async function getLeagues(): Promise<string[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.value

  try {
    const { data: variants } = await supabase
      .from('product_variants')
      .select('league, products!inner(is_active)')
      .eq('products.is_active', true)

    const leagues = [
      ...new Set(
        (variants ?? [])
          .map((v: { league: string | null }) => v.league)
          .filter((l): l is string => !!l)
      )
    ].sort()

    cache = { value: leagues, expiresAt: Date.now() + TTL_MS }
    return leagues
  } catch (err) {
    console.warn('[leagues] query failed, using fallback', err)
    return FALLBACK
  }
}

export function clearLeaguesCache() {
  cache = null
}

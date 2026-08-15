import { supabase } from './supabase'

const FALLBACK: string[] = [
  'Brasileirao', 'Bundesliga', 'La Liga', 'Liga Argentina',
  'Ligue 1', 'Premier League', 'Selecciones', 'Serie A'
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
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    console.warn(`[leagues] query failed, using fallback: ${detail}`, err)
    return FALLBACK
  }
}

export function clearLeaguesCache() {
  cache = null
}

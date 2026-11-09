/** Consulta pública de CEP (ViaCEP). O navegador preenche o endereço; a API só grava. */

export interface CepAddress {
  street: string
  district: string
  city: string
  state: string
}

export function zipDigits(value: string) {
  return value.replace(/\D/g, '').slice(0, 8)
}

export function maskZip(value: string) {
  const raw = zipDigits(value)
  return raw.length > 5 ? `${raw.slice(0, 5)}-${raw.slice(5)}` : raw
}

export function addressFromCep(payload: { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string } | null): CepAddress | null {
  if (!payload || payload.erro) return null
  const city = (payload.localidade ?? '').trim()
  const state = (payload.uf ?? '').trim().toUpperCase()
  if (!city || state.length !== 2) return null
  return {
    street: (payload.logradouro ?? '').trim(),
    district: (payload.bairro ?? '').trim(),
    city,
    state,
  }
}

export async function lookupCep(zip: string, fetchImpl: typeof fetch = fetch): Promise<CepAddress | null> {
  const digits = zipDigits(zip)
  if (digits.length !== 8) return null
  const response = await fetchImpl(`https://viacep.com.br/ws/${digits}/json/`)
  if (!response.ok) throw new Error('cep')
  return addressFromCep(await response.json() as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string })
}

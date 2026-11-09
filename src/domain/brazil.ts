/** Consulta pública do Brasil. Estados são a lista fixa; municípios vêm do IBGE e o CNPJ, da BrasilAPI (base da Receita). */

export const BRAZIL_STATES: { uf: string; name: string }[] = [
  { uf: 'AC', name: 'Acre' }, { uf: 'AL', name: 'Alagoas' }, { uf: 'AM', name: 'Amazonas' }, { uf: 'AP', name: 'Amapá' },
  { uf: 'BA', name: 'Bahia' }, { uf: 'CE', name: 'Ceará' }, { uf: 'DF', name: 'Distrito Federal' }, { uf: 'ES', name: 'Espírito Santo' },
  { uf: 'GO', name: 'Goiás' }, { uf: 'MA', name: 'Maranhão' }, { uf: 'MG', name: 'Minas Gerais' }, { uf: 'MS', name: 'Mato Grosso do Sul' },
  { uf: 'MT', name: 'Mato Grosso' }, { uf: 'PA', name: 'Pará' }, { uf: 'PB', name: 'Paraíba' }, { uf: 'PE', name: 'Pernambuco' },
  { uf: 'PI', name: 'Piauí' }, { uf: 'PR', name: 'Paraná' }, { uf: 'RJ', name: 'Rio de Janeiro' }, { uf: 'RN', name: 'Rio Grande do Norte' },
  { uf: 'RO', name: 'Rondônia' }, { uf: 'RR', name: 'Roraima' }, { uf: 'RS', name: 'Rio Grande do Sul' }, { uf: 'SC', name: 'Santa Catarina' },
  { uf: 'SE', name: 'Sergipe' }, { uf: 'SP', name: 'São Paulo' }, { uf: 'TO', name: 'Tocantins' },
]

export interface CnpjCard {
  legalName: string
  tradeName: string
  state: string
  city: string
  situation: string
}

export type LookupResult<T> = { ok: true; value: T } | { ok: false; message: string }

export const onlyDigits = (value: string) => value.replace(/\D/g, '')

export function maskCnpj(value: string) {
  const digits = onlyDigits(value).slice(0, 14)
  let masked = digits.slice(0, 2)
  if (digits.length > 2) masked += `.${digits.slice(2, 5)}`
  if (digits.length > 5) masked += `.${digits.slice(5, 8)}`
  if (digits.length > 8) masked += `/${digits.slice(8, 12)}`
  if (digits.length > 12) masked += `-${digits.slice(12, 14)}`
  return masked
}

export function maskCpf(value: string) {
  const digits = onlyDigits(value).slice(0, 11)
  let masked = digits.slice(0, 3)
  if (digits.length > 3) masked += `.${digits.slice(3, 6)}`
  if (digits.length > 6) masked += `.${digits.slice(6, 9)}`
  if (digits.length > 9) masked += `-${digits.slice(9, 11)}`
  return masked
}

function checkDigit(digits: string, factors: number[]) {
  const sum = factors.reduce((total, factor, index) => total + Number(digits[index]) * factor, 0)
  const rest = sum % 11
  return rest < 2 ? 0 : 11 - rest
}

export function validCnpj(digits: string) {
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false
  const first = checkDigit(digits, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const second = checkDigit(digits, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return first === Number(digits[12]) && second === Number(digits[13])
}

export function documentError(origin: 'Brasil' | 'Estrangeiro', personType: 'Física' | 'Jurídica', document: string) {
  if (origin !== 'Brasil') return ''
  const count = onlyDigits(document).length
  if (count === 0) return ''
  if (personType === 'Física') return count === 11 ? '' : 'O CPF tem 11 dígitos, ou deixe o campo em branco.'
  if (count !== 14) return 'O CNPJ tem 14 dígitos, ou deixe o campo em branco.'
  return validCnpj(onlyDigits(document)) ? '' : 'CNPJ inválido.'
}

function fold(value: string) {
  return value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export async function loadBrazilCities(uf: string): Promise<LookupResult<string[]>> {
  if (!uf) return { ok: true, value: [] }
  try {
    const response = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`)
    if (!response.ok) return { ok: false, message: 'Não foi possível carregar as cidades agora. Tente de novo.' }
    const data = await response.json() as { nome: string }[]
    return { ok: true, value: data.map(entry => entry.nome).sort((a, b) => a.localeCompare(b, 'pt-BR')) }
  } catch {
    return { ok: false, message: 'Não foi possível carregar as cidades agora. Tente de novo.' }
  }
}

export async function lookupCnpj(digits: string): Promise<LookupResult<CnpjCard>> {
  if (!validCnpj(digits)) return { ok: false, message: 'CNPJ inválido.' }
  try {
    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`)
    if (response.status === 404) return { ok: false, message: 'CNPJ não encontrado na Receita Federal.' }
    if (!response.ok) return { ok: false, message: 'Não foi possível consultar o CNPJ agora. Tente de novo.' }
    const data = await response.json() as { razao_social?: string; nome_fantasia?: string; uf?: string; municipio?: string; descricao_situacao_cadastral?: string }
    const state = (data.uf ?? '').toUpperCase()
    const known = BRAZIL_STATES.some(entry => entry.uf === state)
    let city = ''
    if (known) {
      const cities = await loadBrazilCities(state)
      if (cities.ok) city = cities.value.find(entry => fold(entry) === fold(data.municipio ?? '')) ?? ''
    }
    return {
      ok: true,
      value: {
        legalName: (data.razao_social ?? '').trim(),
        tradeName: (data.nome_fantasia ?? '').trim(),
        state: known ? state : '',
        city,
        situation: (data.descricao_situacao_cadastral ?? '').trim(),
      },
    }
  } catch {
    return { ok: false, message: 'Não foi possível consultar o CNPJ agora. Tente de novo.' }
  }
}

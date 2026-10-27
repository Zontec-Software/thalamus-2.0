import { describe, expect, it } from 'vitest'
import { AREAS, areaDestination } from '../navigation'

const area = (id: string) => AREAS.find(entry => entry.id === id)!

describe('mapa da área', () => {
  it('abre o mapa quando há mais de um módulo liberado', () => {
    expect(areaDestination(area('cadastros'), () => true)).toBe('/area/cadastros')
  })

  it('abre o módulo direto quando o perfil só tem um', () => {
    expect(areaDestination(area('cadastros'), module => module === 'Parceiros')).toBe('/parceiros')
  })

  it('esconde a área quando nenhum módulo está liberado', () => {
    expect(areaDestination(area('cadastros'), () => false)).toBeUndefined()
  })
})

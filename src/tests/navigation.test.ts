import { describe, expect, it } from 'vitest'
import { AREAS, areaDestination, areaOf } from '../navigation'

const area = (id: string) => AREAS.find(entry => entry.id === id)!

describe('mapa da área', () => {
  it('abre o mapa quando há mais de uma tela liberada', () => {
    expect(areaDestination(area('engenharia'), () => true)).toBe('/area/engenharia')
  })

  it('abre a tela direto quando o perfil só tem uma', () => {
    expect(areaDestination(area('comercial'), module => module === 'Vendas')).toBe('/pedidos')
  })

  it('esconde a área quando nenhuma tela está liberada', () => {
    expect(areaDestination(area('comercial'), () => false)).toBeUndefined()
  })

  it('entra direto no módulo que só tem uma tela pronta', () => {
    expect(areaDestination(area('patrimonio'), () => true)).toBe('/ativos')
    expect(areaDestination(area('servicos'), () => true)).toBe('/assistencia')
  })

  it('mantém a porta de quem abriu o cadastro de parceiros', () => {
    expect(areaOf('/parceiros', 'comercial')?.id).toBe('comercial')
    expect(areaOf('/parceiros', 'suprimentos')?.id).toBe('suprimentos')
  })
})

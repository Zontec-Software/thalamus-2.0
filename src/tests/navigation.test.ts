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

  it('patrimônio e serviços abrem o mapa com as telas novas e entram direto quando o perfil só tem uma', () => {
    expect(areaDestination(area('patrimonio'), () => true)).toBe('/area/patrimonio')
    expect(areaDestination(area('servicos'), () => true)).toBe('/area/servicos')
    expect(areaDestination(area('patrimonio'), module => module === 'Ativos')).toBe('/ativos')
    expect(areaDestination(area('servicos'), module => module === 'Assistência Técnica')).toBe('/assistencia')
  })

  it('mantém a porta de quem abriu o cadastro de parceiros', () => {
    expect(areaOf('/parceiros', 'comercial')?.id).toBe('comercial')
    expect(areaOf('/parceiros', 'suprimentos')?.id).toBe('suprimentos')
  })
})

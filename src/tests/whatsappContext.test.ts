import { describe, expect, it } from 'vitest'
import { createSeedState } from '../mocks/seed'
import { findPartnerByPhone, formatPhone, lastClientRequest, planWhatsappChat, readWhatsappContext } from '../domain/whatsappContext'

const message = (over: Record<string, unknown> = {}) => ({
  source: 'thalamus-extension', type: 'whatsapp-context', version: 1, id: 'ctx-1',
  contact: { name: 'Marcelo Dias', phone: '+55 (31) 98800-1200' },
  messages: [
    { from: 'client', text: 'Bom dia! Precisamos de 30 cases IP68 para a parada de 15/12/2026.' },
    { from: 'me', text: 'Bom dia, Marcelo. Já te passo os valores.' },
    { from: 'client', text: 'Perfeito. Pode mandar a proposta.' },
  ],
  ...over,
})

describe('contexto do WhatsApp', () => {
  it('só aceita a mensagem da extensão no formato do protocolo', () => {
    expect(readWhatsappContext(message())?.contact.phone).toBe('5531988001200')
    expect(readWhatsappContext({ ...message(), source: 'outro' })).toBeUndefined()
    expect(readWhatsappContext({ ...message(), version: 2 })).toBeUndefined()
    expect(readWhatsappContext({ ...message(), id: '' })).toBeUndefined()
    expect(readWhatsappContext({ ...message(), contact: { name: '' } })).toBeUndefined()
    expect(readWhatsappContext({ ...message(), messages: [{ from: 'me', text: '   ' }] })).toBeUndefined()
    expect(readWhatsappContext('texto')).toBeUndefined()
    expect(readWhatsappContext(null)).toBeUndefined()
  })

  it('limita o tamanho e descarta o que não é texto', () => {
    const many = Array.from({ length: 150 }, (_, index) => ({ from: 'client', text: `m${index}` }))
    const read = readWhatsappContext(message({ messages: [...many, { from: 'client', text: 42 }, null] }))
    expect(read?.messages).toHaveLength(100)
    expect(read?.messages.at(-1)?.text).toBe('m149')
    expect(readWhatsappContext(message({ messages: [{ from: 'client', text: 'x'.repeat(5000) }] }))?.messages[0].text).toHaveLength(1000)
  })

  it('acha o cliente pelo telefone, sem depender de +55, DDD ou formatação', () => {
    const partners = createSeedState().partners
    expect(findPartnerByPhone(partners, '5531988001200')?.partner.name).toBe('Mineradora Horizonte')
    expect(findPartnerByPhone(partners, '(31) 98800-1200')?.contact.name).toBe('Marcelo Dias')
    expect(findPartnerByPhone(partners, '3188001200')?.partner.name).toBe('Mineradora Horizonte')
    expect(findPartnerByPhone(partners, '5511900000000')).toBeUndefined()
    expect(findPartnerByPhone(partners, '1200')).toBeUndefined()
    expect(findPartnerByPhone(partners, undefined)).toBeUndefined()
  })

  it('não escolhe quando dois clientes têm o mesmo número', () => {
    const book = [
      { id: 'a', name: 'A', contacts: [{ name: 'X', phone: '(31) 98800-1200' }] },
      { id: 'b', name: 'B', contacts: [{ name: 'Y', phone: '+55 31 98800-1200' }] },
    ]
    expect(findPartnerByPhone(book, '31988001200')).toBeUndefined()
  })

  it('formata o telefone e lê só a última fala do cliente', () => {
    expect(formatPhone('5531988001200')).toBe('+55 31 98800-1200')
    expect(formatPhone('3133334444')).toBe('+55 31 3333-4444')
    expect(lastClientRequest(readWhatsappContext(message())!.messages)).toBe('Perfeito. Pode mandar a proposta.')
    expect(lastClientRequest([{ from: 'me', text: 'Oi' }])).toBe('')
  })

  it('monta a abertura com o cliente achado, o pedido e a previsão escrita na conversa', () => {
    const state = createSeedState()
    const context = readWhatsappContext(message({ messages: [{ from: 'client', text: 'Precisamos de 30 cases IP68. A parada é em 15/12/2026.' }] }))!
    const plan = planWhatsappChat(context, state.partners, state.opportunities.filter(entry => entry.partnerId === 'c1'))
    expect(plan.opening[0].from).toBe('user')
    expect(plan.opening[0].whatsapp?.messages).toHaveLength(1)
    expect(plan.opening[1].card?.rows).toContainEqual({ label: 'Cliente', value: 'Mineradora Horizonte' })
    expect(plan.opening[1].card?.rows).toContainEqual({ label: 'Vertical', value: 'Mineração' })
    expect(plan.opening[2].text).toContain('Previsão de fechamento: 15/12/2026')
    expect(plan.then[0].text).toContain('Mineradora Horizonte')
    expect(plan.then[0].link?.to).toMatch(/^\/crm\/oportunidade\/OPP-/)
  })

  it('pergunta pela data quando a conversa não traz e pelo cliente quando o telefone não está cadastrado', () => {
    const state = createSeedState()
    const known = planWhatsappChat(readWhatsappContext(message())!, state.partners, [])
    expect(known.opening[2].text).toContain('Quando ele pretende decidir?')
    expect(known.then[0].link?.to).toBe('/crm/oportunidades')

    const unknown = planWhatsappChat(readWhatsappContext(message({ contact: { name: 'Carla Nova', phone: '5511900000000' } }))!, state.partners, [])
    expect(unknown.opening).toHaveLength(2)
    expect(unknown.opening[1].card).toBeUndefined()
    expect(unknown.opening[1].text).toContain('Não encontrei o número +55 11 90000-0000')
    expect(unknown.then[0].text).toContain('cadastrei Carla Nova')
  })
})

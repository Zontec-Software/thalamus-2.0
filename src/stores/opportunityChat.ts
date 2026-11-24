import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { WhatsappContext } from '../domain/whatsappContext'

/** Cartão com dados lidos do cadastro, mostrado dentro de uma mensagem do assistente. */
export interface ChatCard {
  title: string
  rows: { label: string; value: string }[]
}

export interface ChatMessage {
  id: number
  from: 'assistant' | 'user'
  kind: 'text' | 'audio'
  text: string
  time: string
  /** Duração do áudio, em segundos. */
  seconds?: number
  /** O que foi dito no áudio, quando o assistente já o transcreveu. */
  transcript?: string
  card?: ChatCard
  /** Conversa do WhatsApp trazida pela extensão, anexada como mensagem da pessoa. */
  whatsapp?: Pick<WhatsappContext, 'contact' | 'messages'>
  /** Botão que leva a outra página e minimiza a conversa, para ela continuar à mão. */
  link?: { label: string; to: string }
  /** Faz parte do exemplo da tela, não do que a pessoa escreveu. */
  sample?: boolean
}

type ExampleEntry = Pick<ChatMessage, 'from' | 'kind' | 'text' | 'seconds' | 'transcript' | 'card' | 'link' | 'whatsapp'>

/** Resposta já definida para a próxima mensagem da pessoa, usada quando a conversa nasce de um contexto. */
export type ScriptedReply = Pick<ChatMessage, 'text' | 'card' | 'link'>

/**
 * Conversa de exemplo, só para a tela mostrar o que o assistente faz: achar o cliente já cadastrado,
 * herdar o que vem do cadastro, deduzir o resto do relato, criar a oportunidade e levar a pessoa até ela.
 * Nada aqui é lido nem criado de verdade. O botão "Ver oportunidade" abre uma oportunidade que já existe no seed.
 */
const EXAMPLE: ExampleEntry[] = [
  { from: 'assistant', kind: 'text', text: 'Conte o negócio, por texto ou por áudio. Eu localizo o cliente no cadastro, preencho a oportunidade e pergunto só o que faltar.' },
  { from: 'user', kind: 'text', text: 'Falei hoje com a Bianca, da Translog. Eles querem cotar 200 cases para tablet. Quem indicou foi o Marcelo, da Mineradora Horizonte.' },
  {
    from: 'assistant', kind: 'text', text: 'Encontrei a Translog Brasil entre os seus clientes e selecionei a Bianca Alves como contato.',
    card: {
      title: 'Cliente selecionado',
      rows: [
        { label: 'Cliente', value: 'Translog Brasil' },
        { label: 'CNPJ', value: '23.456.789/0001-20' },
        { label: 'Vertical', value: 'Logística' },
        { label: 'Contato', value: 'Bianca Alves · bianca@translog.com.br' },
      ],
    },
  },
  {
    from: 'assistant', kind: 'text',
    text: 'Por serem cases para tablet, usei a trilha Produtos Roboflex, tipo Venda. A origem ficou Indicação, e anotei o Marcelo Dias na motivação. A Translog já tem o Guard Enterprise em implantação; este é um negócio novo e não precisa de vínculo com ele. Falta a previsão de fechamento. Quando eles pretendem decidir?',
  },
  { from: 'user', kind: 'audio', text: '', seconds: 9, transcript: 'Querem decidir até o fim de dezembro, mas a diretoria ainda precisa aprovar o orçamento.' },
  {
    from: 'assistant', kind: 'text',
    text: 'Pronto, criei a oportunidade "200 cases para tablet · Translog Brasil", na fase Novo contato e com previsão de fechamento em 31/12/2026. A aprovação da diretoria ficou registrada na motivação. Se quiser ajustar algo, peça por aqui ou abra a ficha e edite direto.',
    link: { label: 'Ver oportunidade', to: '/crm/oportunidade/OPP-26044' },
  },
]

/** Respostas de exemplo para o que a pessoa enviar daqui em diante. Ainda não há leitura do conteúdo. */
const SAMPLE_REPLIES = [
  'Entendido. Na versão funcional eu ajustaria a oportunidade criada com essa informação e avisaria aqui.',
  'Nesta demonstração nada é criado nem alterado: a conversa e as respostas são de exemplo.',
]

const clock = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

/** Conversa de criação de oportunidade. Mora fora da tela para sobreviver a minimizar e a trocar de página. */
export const useOpportunityChatStore = defineStore('opportunityChat', () => {
  const open = ref(false)
  const minimized = ref(false)
  const typing = ref(false)
  const unread = ref(0)
  const messages = ref<ChatMessage[]>([])
  let counter = 0
  let timer: number | undefined
  let scripted: ScriptedReply[] = []
  let fallback = 0

  /** Só conta o que a pessoa enviou; o exemplo não pede confirmação para descartar. */
  const started = computed(() => messages.value.some(entry => entry.from === 'user' && !entry.sample))

  function push(from: ChatMessage['from'], text: string, extra: Partial<ChatMessage> = {}) {
    messages.value.push({ id: ++counter, from, kind: 'text', text, time: clock(), ...extra })
    if (from === 'assistant' && minimized.value) unread.value += 1
  }

  function load(entries: ExampleEntry[]) {
    entries.forEach(entry => push(entry.from, entry.text, { kind: entry.kind, seconds: entry.seconds, transcript: entry.transcript, card: entry.card, link: entry.link, whatsapp: entry.whatsapp, sample: true }))
  }
  function show() {
    open.value = true
    minimized.value = false
    unread.value = 0
  }

  /** Abre a conversa. Se já existe uma em andamento, volta para ela. */
  function start() {
    if (!messages.value.length) load(EXAMPLE)
    show()
  }

  /**
   * Abre uma conversa nova a partir de um contexto externo (a extensão do WhatsApp). Substitui a anterior,
   * porque o contexto pertence a um cliente específico. `then` são as respostas para as próximas mensagens da pessoa.
   */
  function begin(opening: ExampleEntry[], then: ScriptedReply[] = []) {
    window.clearTimeout(timer)
    typing.value = false
    messages.value = []
    scripted = [...then]
    fallback = 0
    load(opening)
    show()
  }
  function minimize() {
    minimized.value = true
  }
  function restore() {
    minimized.value = false
    unread.value = 0
  }
  /** Encerra e apaga a conversa. */
  function discard() {
    window.clearTimeout(timer)
    open.value = false
    minimized.value = false
    typing.value = false
    unread.value = 0
    messages.value = []
    scripted = []
    fallback = 0
  }

  function reply() {
    typing.value = true
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      const next = scripted.shift()
      if (next) push('assistant', next.text, { card: next.card, link: next.link })
      else push('assistant', SAMPLE_REPLIES[fallback++ % SAMPLE_REPLIES.length])
      typing.value = false
    }, 900)
  }

  function send(text: string) {
    const clean = text.trim()
    if (!clean) return
    push('user', clean)
    reply()
  }

  /** Áudio simulado: guarda só a duração. Nada é gravado nem transcrito. */
  function sendAudio(seconds: number) {
    push('user', '', { kind: 'audio', seconds: Math.max(1, Math.round(seconds)) })
    reply()
  }

  return { open, minimized, typing, unread, messages, started, start, begin, minimize, restore, discard, send, sendAudio }
})

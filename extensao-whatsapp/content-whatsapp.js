// Roda no WhatsApp Web. Acrescenta a opção "Criar oportunidade" ao menu de cada mensagem (o menu de Responder,
// Copiar, Reagir, Encaminhar...). Ao escolher, abre o Thalamus com o chat de nova oportunidade.
//
// Por enquanto a opção NÃO lê a conversa: abre uma conversa de exemplo fixa (Marcelo Dias, da Mineradora
// Horizonte), para demonstrar o fluxo. A mensagem em que o menu foi aberto é guardada em `lastRow`, que é de
// onde o contexto real sairia.
//
// Atenção: o WhatsApp Web não tem API pública e muda a estrutura da página sem aviso. O menu é achado pelos
// textos "Encaminhar" (ou "Forward") e pelos vizinhos dele (Responder, Copiar, Apagar...), e a opção é uma
// cópia da linha de "Encaminhar", para herdar o visual. Se o WhatsApp mudar esses textos ou a estrutura, a
// opção deixa de aparecer. As mensagens "[Thalamus]" no console da aba dizem o que a extensão viu.

const VERSION = '0.4.0'
const ITEM_ATTR = 'data-thalamus-item'
const LABEL = 'Criar oportunidade'
const FORWARD = /^(encaminhar|forward)$/i
const MENU_WORDS = /^(responder|reply|copiar|copy|reagir|react|fixar|pin|favoritar|star|apagar|delete|denunciar|report)$/i
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g
// O ícone do menu é uma fonte de ligaduras: o texto dele é o nome ("ic-reply"), colado ao rótulo ("ic-replyResponder").
const ICON_NAME = /^(?:wds-)?ic-[a-z0-9-]+$/
const ICON_PREFIX = /^(?:wds-)?ic-[a-z0-9-]+(?=[A-ZÀ-Ý])/

/** Conversa de exemplo. O telefone é o do Marcelo Dias no cadastro de demonstração do mockup. */
const EXAMPLE = {
  contact: { name: 'Marcelo Dias', phone: '5531988001200' },
  messages: [
    { from: 'client', text: 'Bom dia! Aqui é o Marcelo, da Mineradora Horizonte.', at: '09:12' },
    { from: 'me', text: 'Bom dia, Marcelo! Em que posso ajudar?', at: '09:13' },
    { from: 'client', text: 'Vamos renovar os cases dos tablets da mina. Precisamos de 30 unidades com proteção IP68.', at: '09:15' },
    { from: 'client', text: 'A parada da mina está marcada para 15/12/2026, então precisamos receber antes.', at: '09:15' },
    { from: 'client', text: 'Pode me mandar uma proposta?', at: '09:16' },
  ],
}

console.info(`[Thalamus] extensão ${VERSION} ativa no WhatsApp Web`)

function context() {
  return {
    source: 'thalamus-extension',
    type: 'whatsapp-context',
    version: 1,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...EXAMPLE,
  }
}

const clean = text => (text ?? '').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim()

/** Mensagem em que a pessoa clicou por último (seta do menu ou botão direito). */
let lastRow = null
let timers = []

function remember(event) {
  const row = event.target?.closest?.('[data-id]')
  if (row) lastRow = row
  scheduleScans(event.type === 'contextmenu')
}
document.addEventListener('pointerdown', remember, true)
document.addEventListener('contextmenu', remember, true)

async function choose() {
  console.info('[Thalamus] criar oportunidade a partir da mensagem', lastRow?.getAttribute('data-id') ?? '(desconhecida)')
  try {
    const response = await chrome.runtime.sendMessage({ type: 'thalamus:open', payload: context() })
    if (!response?.ok) throw new Error(response?.error ?? 'sem resposta')
  } catch (error) {
    window.alert(`Não consegui abrir o Thalamus: ${error.message ?? error}`)
  }
}

/** Fecha o menu do WhatsApp, que não sabe que a opção foi escolhida. */
function closeMenu() {
  const target = document.activeElement ?? document.body
  for (const type of ['keydown', 'keyup']) {
    target.dispatchEvent(new KeyboardEvent(type, { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }))
  }
}

/** Texto de mensagem não é item de menu: uma mensagem pode conter a palavra "Encaminhar". */
const isMessageText = element => Boolean(element.closest('.selectable-text, [data-pre-plain-text]'))

/** Primeiro elemento cujo texto próprio (sem caracteres invisíveis) bate com o padrão. */
function leafWithText(root, pattern, skip) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const element = walker.currentNode.parentElement
    if (!element || !pattern.test(clean(walker.currentNode.nodeValue))) continue
    if (skip?.(element)) continue
    return element
  }
  return null
}

/** Sobe da palavra "Encaminhar" até a linha do menu: a que tem irmãos e pelo menos dois deles são itens do menu. */
function findForwardRow(root) {
  const label = leafWithText(root, FORWARD, isMessageText)
  if (!label) return { reason: 'sem-rotulo' }
  let row = label
  for (let level = 0; level < 10 && row.parentElement; level += 1) {
    const list = row.parentElement
    const siblings = [...list.children].filter(child => child !== row)
    const items = siblings.filter(child => MENU_WORDS.test(clean(child.textContent).replace(ICON_PREFIX, ''))).length
    if (siblings.length >= 2 && items >= 2) return { row }
    row = list
  }
  return { reason: 'sem-lista', label }
}

function buildRow(template) {
  const row = template.cloneNode(true)
  row.setAttribute(ITEM_ATTR, '')
  for (const element of [row, ...row.querySelectorAll('*')]) {
    for (const name of ['id', 'data-testid', 'aria-label', 'title', 'aria-disabled']) element.removeAttribute(name)
  }
  row.setAttribute('aria-label', LABEL)

  const text = leafWithText(row, FORWARD)
  if (text) text.textContent = LABEL

  const iconOf = root => root.querySelector('[data-icon]') ?? root.querySelector('svg') ?? leafWithText(root, ICON_NAME)
  const own = iconOf(template)
  const size = Math.min(Math.round(own?.getBoundingClientRect().width || 20), 24)
  const mark = document.createElement('img')
  mark.src = chrome.runtime.getURL('icons/thalamus.png')
  mark.alt = ''
  mark.style.cssText = `width:${size}px;height:${size}px;padding:2px;box-sizing:border-box;border-radius:6px;background:#fff;object-fit:contain;flex:none`
  const icon = iconOf(row)
  if (icon) icon.replaceWith(mark)
  else row.prepend(mark)

  row.addEventListener('click', event => {
    event.preventDefault()
    event.stopPropagation()
    closeMenu()
    choose()
  }, true)
  return row
}

/** Se `root` contém o menu de uma mensagem, põe a opção como primeira do menu. */
function inject(root) {
  const found = findForwardRow(root)
  if (!found.row) return found
  if (found.row.parentElement.querySelector(`[${ITEM_ATTR}]`)) return { ...found, reason: 'ja-existe' }
  const first = [...found.row.parentElement.children].find(child => MENU_WORDS.test(clean(child.textContent).replace(ICON_PREFIX, ''))) ?? found.row
  first.before(buildRow(found.row))
  return { ...found, reason: 'ok' }
}

/** Descreve a cadeia de elementos acima de um nó, para quem for ajustar a extensão. */
function describe(element) {
  const lines = []
  for (let node = element, level = 0; node && level < 9; node = node.parentElement, level += 1) {
    const kids = [...node.children].map(child => clean(child.textContent).slice(0, 18)).slice(0, 8)
    lines.push(`${level}: <${node.tagName.toLowerCase()}${node.getAttribute('role') ? ` role=${node.getAttribute('role')}` : ''}> filhos=${node.children.length} ${JSON.stringify(kids)}`)
  }
  return lines.join('\n')
}

/** O menu aparece um instante depois do clique: procura algumas vezes e para quando a opção entra. */
function scheduleScans(rightClick) {
  timers.forEach(clearTimeout)
  const waits = [60, 160, 350, 700, 1200]
  timers = waits.map((wait, index) => setTimeout(() => {
    const result = inject(document.body)
    if (result.reason === 'ok' || result.reason === 'ja-existe') {
      if (result.reason === 'ok') console.info(`[Thalamus] opção "${LABEL}" adicionada ao menu (${wait} ms depois do clique)`)
      timers.forEach(clearTimeout)
      return
    }
    if (index !== waits.length - 1) return
    if (result.reason === 'sem-lista') console.info('[Thalamus] achei "Encaminhar", mas não a lista do menu. Estrutura:\n' + describe(result.label))
    else if (rightClick) console.info('[Thalamus] botão direito sem a palavra "Encaminhar" na página: o menu não abriu ou está em outro idioma')
  }, wait))
}

// Segunda via: o menu pode entrar inteiro ou linha por linha, sem clique que a primeira via perceba.
new MutationObserver(records => {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (node.nodeType !== 1) continue
      const text = node.textContent ?? ''
      if (text.length > 800 || !/encaminhar|forward/i.test(text)) continue
      let root = node
      for (let level = 0; level < 6 && root; level += 1, root = root.parentElement) {
        if ((root.textContent?.length ?? 0) > 2000) break
        if (inject(root).reason === 'ok') {
          console.info(`[Thalamus] opção "${LABEL}" adicionada ao menu (pela mudança na página)`)
          break
        }
      }
    }
  }
}).observe(document.body, { childList: true, subtree: true })

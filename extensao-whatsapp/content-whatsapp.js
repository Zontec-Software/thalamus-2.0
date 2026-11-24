// Roda no WhatsApp Web. Põe o botão "Criar oportunidade" no cabeçalho da conversa aberta.
// Por enquanto o botão NÃO lê a conversa: ao clicar, abre o Thalamus com uma conversa de exemplo fixa
// (Marcelo Dias, da Mineradora Horizonte), para demonstrar o fluxo.
//
// Atenção: o WhatsApp Web não tem API pública e muda a estrutura da página sem aviso. O seletor do
// cabeçalho (#main header) pode quebrar; é o ponto frágil deste protótipo.

const BUTTON_ID = 'thalamus-create-opportunity'

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

function context() {
  return {
    source: 'thalamus-extension',
    type: 'whatsapp-context',
    version: 1,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...EXAMPLE,
  }
}

async function onClick() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'thalamus:open', payload: context() })
    if (!response?.ok) throw new Error(response?.error ?? 'sem resposta')
  } catch (error) {
    window.alert(`Não consegui abrir o Thalamus: ${error.message ?? error}`)
  }
}

/**
 * Acha o botão da chamada de vídeo no cabeçalho. O WhatsApp Web troca nomes e estrutura sem aviso, então há
 * duas tentativas: (1) o texto "vídeo" no aria-label, no title ou no data-icon; (2) o ícone mais à esquerda
 * entre os pequenos da metade direita do cabeçalho, que é onde fica a chamada de vídeo.
 */
function findVideoButton(header) {
  const mine = document.getElementById(BUTTON_ID)
  const labelled = [...header.querySelectorAll('[aria-label], [title], [data-icon]')].find(element => {
    if (mine?.contains(element)) return false
    const text = `${element.getAttribute('aria-label') ?? ''} ${element.getAttribute('title') ?? ''} ${element.getAttribute('data-icon') ?? ''}`
    return /v[ií]deo/i.test(text)
  })
  if (labelled) return { node: labelled.closest('[role="button"], button') ?? labelled, how: 'texto' }

  const box = header.getBoundingClientRect()
  const icons = [...header.querySelectorAll('[role="button"], button')]
    .filter(element => !mine?.contains(element) && element.querySelector('svg, [data-icon]'))
    .map(element => ({ element, rect: element.getBoundingClientRect() }))
    .filter(({ rect }) => rect.width > 0 && rect.width <= 72 && rect.height <= 72 && rect.left > box.left + box.width / 2)
    .sort((a, b) => a.rect.left - b.rect.left)
  return icons.length ? { node: icons[0].element, how: 'posição' } : undefined
}

/** Põe o botão à esquerda da chamada de vídeo; se não achar, vai para o fim do cabeçalho. */
function placeButton(button, header) {
  const found = findVideoButton(header)
  if (found) {
    // Sobe enquanto o ícone estiver sozinho dentro de um invólucro, para ficar na mesma fileira dos outros.
    let anchor = found.node
    while (anchor.parentElement && anchor.parentElement !== header && anchor.parentElement.children.length === 1) anchor = anchor.parentElement
    if (anchor.parentNode) {
      if (button.parentNode === anchor.parentNode && button.nextElementSibling === anchor) return
      anchor.parentNode.insertBefore(button, anchor)
      console.debug(`[Thalamus] botão posicionado antes da chamada de vídeo (${found.how})`)
      return
    }
  }
  if (button.parentNode !== header || header.lastElementChild !== button) {
    header.appendChild(button)
    console.debug('[Thalamus] chamada de vídeo não encontrada; botão no fim do cabeçalho')
  }
}

function ensureButton() {
  const head = document.querySelector('#main header')
  const current = document.getElementById(BUTTON_ID)
  if (!head) {
    current?.remove()
    return
  }
  if (current) {
    placeButton(current, head)
    return
  }
  const button = document.createElement('button')
  button.id = BUTTON_ID
  button.type = 'button'
  const mark = document.createElement('img')
  mark.className = 'thalamus-mark'
  mark.alt = ''
  mark.src = chrome.runtime.getURL('icons/thalamus.png')
  const label = document.createElement('span')
  label.textContent = 'Criar oportunidade'
  button.append(mark, label)
  button.title = 'Cria uma oportunidade no Thalamus (demonstração: usa uma conversa de exemplo)'
  button.addEventListener('click', onClick)
  placeButton(button, head)
}

let scheduled = false
new MutationObserver(() => {
  if (scheduled) return
  scheduled = true
  requestAnimationFrame(() => {
    scheduled = false
    ensureButton()
  })
}).observe(document.body, { childList: true, subtree: true })
ensureButton()

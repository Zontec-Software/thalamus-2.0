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

function ensureButton() {
  const head = document.querySelector('#main header')
  const current = document.getElementById(BUTTON_ID)
  if (!head) {
    current?.remove()
    return
  }
  if (current && head.contains(current)) return
  current?.remove()
  const button = document.createElement('button')
  button.id = BUTTON_ID
  button.type = 'button'
  button.textContent = 'Criar oportunidade'
  button.title = 'Cria uma oportunidade no Thalamus (demonstração: usa uma conversa de exemplo)'
  button.addEventListener('click', onClick)
  head.appendChild(button)
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

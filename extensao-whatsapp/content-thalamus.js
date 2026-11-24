// Roda na página do Thalamus (mockup). Entrega a conversa ao chat de nova oportunidade por postMessage.
// A página responde { source: 'thalamus-mockup', type: 'ready' } quando está pronta; até lá a conversa fica guardada aqui.

let payload = null

function post() {
  if (payload) window.postMessage(payload, window.location.origin)
}

window.addEventListener('message', event => {
  if (event.source !== window) return
  if (event.data?.source === 'thalamus-mockup' && event.data.type === 'ready') post()
})

// Aba aberta pela extensão: a conversa espera no segundo plano.
chrome.runtime.sendMessage({ type: 'thalamus:pull' }).then(response => {
  if (response?.payload) {
    payload = response.payload
    post()
  }
})

// Aba que já estava aberta: a conversa chega por aqui.
chrome.runtime.onMessage.addListener(message => {
  if (message?.type === 'thalamus:push' && message.payload) {
    payload = message.payload
    post()
  }
})

// Recebe a conversa do WhatsApp Web e a entrega à página do Thalamus (mockup), abrindo-a se for preciso.

const DESTINATIONS = {
  pages: 'https://zontec-software.github.io/thalamus-2.0/crm/oportunidades',
  local: 'http://localhost:8080/crm/oportunidades',
}
const PENDING_TTL = 10 * 60 * 1000

async function destination() {
  const { target } = await chrome.storage.sync.get({ target: 'pages' })
  return DESTINATIONS[target] ?? DESTINATIONS.pages
}

/** No GitHub Pages o mockup mora em /thalamus-2.0/; no servidor local, na raiz. */
function matchPattern(url) {
  const { origin, hostname, pathname } = new URL(url)
  const base = hostname.endsWith('github.io') ? `/${pathname.split('/')[1]}/` : '/'
  return `${origin}${base}*`
}

async function deliver(payload) {
  const url = await destination()
  const open = await chrome.tabs.query({ url: matchPattern(url) })
  if (open.length) {
    const tab = open[0]
    await chrome.tabs.update(tab.id, { active: true })
    await chrome.windows.update(tab.windowId, { focused: true })
    await chrome.tabs.sendMessage(tab.id, { type: 'thalamus:push', payload })
    return
  }
  const tab = await chrome.tabs.create({ url })
  await chrome.storage.session.set({ pending: { tabId: tab.id, payload, at: Date.now() } })
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type === 'thalamus:open') {
    deliver(message.payload).then(() => respond({ ok: true }), error => respond({ ok: false, error: String(error) }))
    return true
  }
  if (message?.type === 'thalamus:pull') {
    chrome.storage.session.get('pending').then(async ({ pending }) => {
      if (pending && sender.tab?.id === pending.tabId && Date.now() - pending.at < PENDING_TTL) {
        await chrome.storage.session.remove('pending')
        respond({ payload: pending.payload })
      } else {
        respond({})
      }
    })
    return true
  }
  return false
})

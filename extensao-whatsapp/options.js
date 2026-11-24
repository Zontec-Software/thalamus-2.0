const select = document.getElementById('target')
const saved = document.getElementById('saved')

chrome.storage.sync.get({ target: 'pages' }).then(({ target }) => {
  select.value = target
})

select.addEventListener('change', async () => {
  await chrome.storage.sync.set({ target: select.value })
  saved.textContent = 'Salvo.'
})

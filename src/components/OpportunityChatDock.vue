<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronUp, ExternalLink, MessageCircle, Mic, Minus, Play, Send, Sparkles, Trash2, X } from 'lucide-vue-next'
import { formatPhone, planWhatsappChat, readWhatsappContext, WHATSAPP_READY } from '../domain/whatsappContext'
import { useErpStore } from '../stores/erp'
import { useOpportunityChatStore } from '../stores/opportunityChat'
import { useUiStore } from '../stores/ui'

const chat = useOpportunityChatStore()
const store = useErpStore()
const ui = useUiStore()
const draft = ref('')
const confirmDiscard = ref(false)
const scroller = ref<HTMLElement | null>(null)
const input = ref<HTMLTextAreaElement | null>(null)
const recording = ref(false)
const seconds = ref(0)
let ticker: number | undefined

const router = useRouter()
/** Leva a pessoa à página e minimiza a conversa, que continua à mão no canto da tela. */
function openLink(to: string) {
  chat.minimize()
  router.push(to)
}
const visible = () => chat.open && !chat.minimized
const duration = (total: number) => `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
/** Altura das barras da onda: fixa por mensagem, só para a tela parecer um áudio. */
const bar = (id: number, index: number) => 22 + ((id * 7 + index * 13) % 62)

function toBottom() {
  nextTick(() => {
    if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
  })
}
function focusInput() {
  nextTick(() => input.value?.focus())
}
function grow() {
  const element = input.value
  if (!element) return
  element.style.height = 'auto'
  element.style.height = `${Math.min(element.scrollHeight, 120)}px`
  element.style.overflowY = element.scrollHeight > 120 ? 'auto' : 'hidden'
}
function send() {
  if (!draft.value.trim()) return
  chat.send(draft.value)
  draft.value = ''
  nextTick(grow)
}
function onKey(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    send()
  }
}

/** Gravação simulada: só conta o tempo. Nenhum áudio é captado. */
function startRecording() {
  recording.value = true
  seconds.value = 0
  window.clearInterval(ticker)
  ticker = window.setInterval(() => {
    seconds.value += 1
  }, 1000)
}
function stopRecording() {
  window.clearInterval(ticker)
  recording.value = false
  focusInput()
}
function sendRecording() {
  chat.sendAudio(seconds.value)
  stopRecording()
}

function close() {
  if (chat.started) confirmDiscard.value = true
  else discard()
}
function minimize() {
  confirmDiscard.value = false
  chat.minimize()
}
function closeFromMini() {
  if (chat.started) {
    chat.restore()
    confirmDiscard.value = true
  } else discard()
}
function discard() {
  confirmDiscard.value = false
  draft.value = ''
  window.clearInterval(ticker)
  recording.value = false
  chat.discard()
}

watch(() => [chat.messages.length, chat.typing], toBottom)
watch(() => [chat.open, chat.minimized], () => {
  if (visible()) {
    toBottom()
    focusInput()
  }
}, { flush: 'post' })
/** Conversa do WhatsApp enviada pela extensão do Chrome. Só vale a mensagem da própria janela, no formato do protocolo. */
let lastContext = ''
function onWindowMessage(event: MessageEvent) {
  if (event.source !== window) return
  const context = readWhatsappContext(event.data)
  if (!context || context.id === lastContext) return
  lastContext = context.id
  const plan = planWhatsappChat(
    context,
    store.state.partners,
    store.state.opportunities.filter(entry => entry.tenantId === ui.activeTenantId).sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')),
  )
  draft.value = ''
  confirmDiscard.value = false
  stopRecording()
  chat.begin(plan.opening, plan.then)
}
onMounted(() => {
  window.addEventListener('message', onWindowMessage)
  window.postMessage(WHATSAPP_READY, window.location.origin)
})
onBeforeUnmount(() => {
  window.clearInterval(ticker)
  window.removeEventListener('message', onWindowMessage)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="chat.open && !chat.minimized" class="modal-backdrop" @click.self="minimize" @keydown.esc="minimize">
        <section class="opp-chat" role="dialog" aria-label="Nova oportunidade, conversa com o assistente">
          <header class="opp-chat-head">
            <span class="opp-chat-avatar"><Sparkles :size="16" /></span>
            <div class="opp-chat-title">
              <h2>Nova oportunidade</h2>
              <p>Assistente do CRM</p>
            </div>
            <button class="icon-plain" title="Minimizar" aria-label="Minimizar" @click="minimize"><Minus :size="18" /></button>
            <button class="icon-plain" title="Encerrar conversa" aria-label="Encerrar conversa" @click="close"><X :size="18" /></button>
          </header>

          <div v-if="confirmDiscard" class="opp-chat-confirm">
            <span>Descartar esta conversa? A oportunidade ainda não foi criada.</span>
            <button class="button secondary small" @click="confirmDiscard = false">Continuar</button>
            <button class="button small" @click="discard">Descartar</button>
          </div>

          <div ref="scroller" class="opp-chat-body">
            <p class="opp-chat-note">Protótipo da tela: as respostas são de exemplo ou montadas por regras simples. O assistente ainda não entende texto livre, não ouve áudio e não cria a oportunidade.</p>
            <div v-for="message in chat.messages" :key="message.id" class="opp-chat-row" :class="message.from">
              <div v-if="message.kind === 'audio'" class="opp-chat-bubble audio" :aria-label="`Mensagem de áudio de ${duration(message.seconds ?? 0)}`">
                <div class="opp-chat-player">
                  <span class="opp-chat-play"><Play :size="14" /></span>
                  <span class="opp-chat-wave"><b v-for="n in 28" :key="n" :style="{ height: `${bar(message.id, n)}%` }"></b></span>
                  <span class="opp-chat-len">{{ duration(message.seconds ?? 0) }}</span>
                </div>
                <p v-if="message.transcript" class="opp-chat-transcript">{{ message.transcript }}</p>
              </div>
              <div v-else class="opp-chat-bubble">
                {{ message.text }}
                <details v-if="message.whatsapp" class="opp-chat-attach">
                  <summary><MessageCircle :size="14" /> Conversa do WhatsApp · {{ message.whatsapp.contact.name }}<template v-if="message.whatsapp.contact.phone"> · {{ formatPhone(message.whatsapp.contact.phone) }}</template> · {{ message.whatsapp.messages.length }} mensagens</summary>
                  <ul>
                    <li v-for="(line, index) in message.whatsapp.messages" :key="index"><b>{{ line.from === 'me' ? 'Você' : message.whatsapp.contact.name }}</b> {{ line.text }}</li>
                  </ul>
                </details>
              </div>
              <div v-if="message.card" class="opp-chat-card">
                <h3>{{ message.card.title }}</h3>
                <dl>
                  <div v-for="row in message.card.rows" :key="row.label">
                    <dt>{{ row.label }}</dt>
                    <dd>{{ row.value }}</dd>
                  </div>
                </dl>
              </div>
              <button v-if="message.link" class="button small opp-chat-link" @click="openLink(message.link.to)"><ExternalLink :size="13" /> {{ message.link.label }}</button>
              <span class="opp-chat-time">{{ message.time }}</span>
            </div>
            <div v-if="chat.typing" class="opp-chat-row assistant" aria-live="polite">
              <div class="opp-chat-bubble typing"><i></i><i></i><i></i></div>
            </div>
          </div>

          <footer class="opp-chat-foot">
            <template v-if="recording">
              <button class="opp-chat-cancel" title="Descartar áudio" aria-label="Descartar áudio" @click="stopRecording"><Trash2 :size="17" /></button>
              <div class="opp-chat-rec" aria-live="polite">
                <i class="opp-chat-dot"></i>
                <span class="opp-chat-len">{{ duration(seconds) }}</span>
                <span class="opp-chat-wave live"><b v-for="n in 28" :key="n" :style="{ animationDelay: `${(n % 7) * 0.09}s` }"></b></span>
              </div>
              <button class="opp-chat-send" title="Enviar áudio" aria-label="Enviar áudio" @click="sendRecording"><Send :size="16" /></button>
            </template>
            <template v-else>
              <textarea ref="input" v-model="draft" rows="1" placeholder="Descreva a oportunidade…" aria-label="Mensagem" @input="grow" @keydown="onKey"></textarea>
              <button v-if="draft.trim()" class="opp-chat-send" title="Enviar" aria-label="Enviar" @click="send"><Send :size="16" /></button>
              <button v-else class="opp-chat-send" title="Gravar áudio" aria-label="Gravar áudio" @click="startRecording"><Mic :size="17" /></button>
            </template>
          </footer>
          <p class="opp-chat-hint">{{ recording ? 'Gravação simulada: nenhum áudio é captado.' : 'Enter envia. Shift + Enter quebra a linha. O microfone grava um áudio.' }}</p>
        </section>
      </div>
    </Transition>

    <button v-if="chat.open && chat.minimized" class="opp-chat-mini" @click="chat.restore()">
      <span class="opp-chat-avatar"><Sparkles :size="14" /></span>
      <span class="opp-chat-mini-title">Nova oportunidade</span>
      <span v-if="chat.unread" class="opp-chat-badge">{{ chat.unread }}</span>
      <ChevronUp :size="16" />
      <span class="opp-chat-mini-close" role="button" tabindex="0" title="Encerrar conversa" aria-label="Encerrar conversa" @click.stop="closeFromMini" @keydown.enter.stop="closeFromMini"><X :size="15" /></span>
    </button>
  </Teleport>
</template>

<style scoped>
.opp-chat { width: 560px; max-width: 96vw; height: min(680px, 90vh); background: var(--surface-card, #fff); border-radius: 14px; box-shadow: 0 30px 70px rgba(0, 0, 0, .25); display: flex; flex-direction: column; overflow: hidden; }
.opp-chat-head { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 1px solid var(--border); flex: none; }
.opp-chat-title { flex: 1; min-width: 0; }
.opp-chat-title h2 { font-size: 16px; line-height: 1.2; }
.opp-chat-title p { font-size: 12px; color: var(--muted); margin-top: 2px; }
.opp-chat-avatar { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; background: var(--blue, #3b5ba9); color: white; flex: none; }
.opp-chat-confirm { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 16px; background: #FFF6E5; border-bottom: 1px solid #F1DDB0; font-size: 13px; }
.opp-chat-confirm span { flex: 1 1 200px; }
.opp-chat-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; background: #F6F8FB; }
.opp-chat-note { font-size: 12px; color: var(--muted); background: white; border: 1px dashed var(--border); border-radius: 10px; padding: 8px 10px; }
.opp-chat-row { display: flex; flex-direction: column; gap: 3px; max-width: 82%; }
.opp-chat-row.assistant { align-self: flex-start; align-items: flex-start; }
.opp-chat-row.user { align-self: flex-end; align-items: flex-end; }
.opp-chat-bubble { padding: 9px 13px; border-radius: 14px; font-size: 14px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
.assistant .opp-chat-bubble { background: white; border: 1px solid var(--border); border-bottom-left-radius: 4px; }
.user .opp-chat-bubble { background: var(--blue, #3b5ba9); color: white; border-bottom-right-radius: 4px; }
.opp-chat-time { font-size: 11px; color: var(--muted); padding: 0 4px; }
.opp-chat-bubble.typing { display: flex; gap: 4px; padding: 12px 14px; }
.opp-chat-bubble.typing i { width: 6px; height: 6px; border-radius: 50%; background: #9AA5B8; animation: opp-chat-dot 1s infinite ease-in-out; }
.opp-chat-bubble.typing i:nth-child(2) { animation-delay: .15s; }
.opp-chat-bubble.typing i:nth-child(3) { animation-delay: .3s; }
@keyframes opp-chat-dot { 0%, 80%, 100% { opacity: .3; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }

/* Áudio */
.opp-chat-bubble.audio { white-space: normal; width: 300px; max-width: 100%; }
.opp-chat-player { display: flex; align-items: center; gap: 10px; }
.opp-chat-play { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: rgba(255, 255, 255, .22); flex: none; }
.opp-chat-wave { flex: 1; height: 24px; display: flex; align-items: center; gap: 2px; min-width: 0; }
.opp-chat-wave b { flex: 1 1 0; min-width: 0; border-radius: 2px; background: rgba(255, 255, 255, .8); }
.opp-chat-len { font-size: 12px; font-variant-numeric: tabular-nums; flex: none; }
.opp-chat-transcript { margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255, 255, 255, .28); font-size: 13px; line-height: 1.4; opacity: .95; }

/* Conversa do WhatsApp anexada */
.opp-chat-attach { margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255, 255, 255, .28); font-size: 13px; }
.opp-chat-attach summary { cursor: pointer; display: flex; align-items: center; gap: 6px; line-height: 1.35; }
.opp-chat-attach ul { list-style: none; margin: 8px 0 0; padding: 0; max-height: 180px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
.opp-chat-attach li { font-size: 12.5px; line-height: 1.4; opacity: .95; }
.opp-chat-attach li b { margin-right: 4px; }

/* Cartão de dados */
.opp-chat-card { align-self: stretch; background: white; border: 1px solid var(--border); border-radius: 12px; padding: 10px 12px; min-width: 330px; }
.opp-chat-card h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin-bottom: 6px; }
.opp-chat-card dl { display: flex; flex-direction: column; }
.opp-chat-card dl > div { display: grid; grid-template-columns: 70px 1fr; gap: 8px; align-items: baseline; padding: 5px 0; border-top: 1px solid var(--border); font-size: 13px; }
.opp-chat-card dl > div:first-child { border-top: 0; }
.opp-chat-card dt { color: var(--muted); }
.opp-chat-card dd { margin: 0; overflow-wrap: anywhere; }
.opp-chat-link { display: inline-flex; align-items: center; gap: 6px; margin-top: 4px; }

/* Rodapé */
.opp-chat-foot { display: flex; align-items: flex-end; gap: 8px; padding: 12px 16px 4px; border-top: 1px solid var(--border); flex: none; }
.opp-chat-foot textarea { flex: 1; resize: none; border: 1px solid var(--border); border-radius: 12px; padding: 9px 12px; font: inherit; font-size: 14px; line-height: 1.4; max-height: 120px; min-height: 40px; overflow-y: hidden; }
.opp-chat-foot textarea:focus { outline: 2px solid color-mix(in srgb, var(--blue, #3b5ba9) 35%, transparent); border-color: var(--blue, #3b5ba9); }
.opp-chat-send { width: 40px; height: 40px; border: 0; border-radius: 50%; background: var(--blue, #3b5ba9); color: white; display: grid; place-items: center; flex: none; cursor: pointer; }
.opp-chat-send:hover { filter: brightness(1.1); }
.opp-chat-cancel { width: 40px; height: 40px; border: 1px solid var(--border); border-radius: 50%; background: white; color: var(--muted); display: grid; place-items: center; flex: none; cursor: pointer; }
.opp-chat-cancel:hover { color: #C0392B; border-color: #E7B4AE; }
.opp-chat-rec { flex: 1; min-width: 0; height: 40px; display: flex; align-items: center; gap: 10px; padding: 0 14px; border: 1px solid var(--border); border-radius: 20px; background: #FFF7F6; }
.opp-chat-dot { width: 9px; height: 9px; border-radius: 50%; background: #E5484D; flex: none; animation: opp-chat-blink 1s infinite; }
@keyframes opp-chat-blink { 50% { opacity: .25; } }
.opp-chat-rec .opp-chat-wave b { background: #E5484D; opacity: .7; height: 30%; animation: opp-chat-bar .9s infinite ease-in-out; }
@keyframes opp-chat-bar { 0%, 100% { height: 20%; } 50% { height: 90%; } }
.opp-chat-hint { font-size: 11px; color: var(--muted); padding: 4px 18px 10px; flex: none; }

/* Minimizada: fixa no canto inferior direito, como o rascunho de e-mail. */
.opp-chat-mini { position: fixed; right: 24px; bottom: 0; z-index: 85; width: 300px; display: flex; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid var(--border); border-bottom: 0; border-radius: 12px 12px 0 0; background: var(--surface-card, #fff); color: inherit; font: inherit; font-size: 14px; font-weight: 600; text-align: left; cursor: pointer; box-shadow: 0 -6px 24px rgba(0, 0, 0, .16); }
.opp-chat-mini:hover { background: #F6F8FB; }
.opp-chat-mini .opp-chat-avatar { width: 26px; height: 26px; }
.opp-chat-mini-title { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.opp-chat-badge { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px; background: #E5484D; font-size: 12px; display: grid; place-items: center; }
.opp-chat-mini-close { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 6px; }
.opp-chat-mini-close:hover { background: #E8ECF3; }
@media (max-width: 640px) { .opp-chat-mini { right: 8px; width: calc(100vw - 16px); } }
</style>

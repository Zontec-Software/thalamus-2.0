<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { Bold, Italic, List, ListOrdered, Underline } from 'lucide-vue-next'

const model = defineModel<string>({ required: true })
const props = defineProps<{ disabled?: boolean }>()
const editor = ref<HTMLElement>()

const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'P', 'BR', 'DIV'])

/** Mantém só a formatação da barra. O resto vira texto. */
function sanitize(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const walk = (node: Node) => {
    ;[...node.childNodes].forEach(child => {
      if (child.nodeType !== Node.ELEMENT_NODE) return
      const element = child as HTMLElement
      if (!ALLOWED.has(element.tagName)) {
        element.replaceWith(...element.childNodes)
        walk(node)
        return
      }
      ;[...element.attributes].forEach(attribute => element.removeAttribute(attribute.name))
      walk(element)
    })
  }
  walk(doc.body)
  const text = doc.body.textContent?.replace(/\u00a0/g, ' ').trim()
  return text ? doc.body.innerHTML : ''
}

function paint() {
  const element = editor.value
  if (!element || document.activeElement === element) return
  const next = model.value || ''
  if (element.innerHTML !== next) element.innerHTML = next
}

watch(() => model.value, () => nextTick(paint))
watch(() => props.disabled, () => nextTick(paint))
watch(editor, () => nextTick(paint))

function publish() {
  model.value = sanitize(editor.value?.innerHTML ?? '')
}

function command(name: string) {
  editor.value?.focus()
  document.execCommand(name)
  publish()
}
</script>

<template>
  <div class="rich-text" :class="{ disabled }">
    <div v-if="!disabled" class="rich-bar" role="toolbar" aria-label="Formatação">
      <button type="button" title="Negrito" @mousedown.prevent="command('bold')"><Bold :size="14" /></button>
      <button type="button" title="Itálico" @mousedown.prevent="command('italic')"><Italic :size="14" /></button>
      <button type="button" title="Sublinhado" @mousedown.prevent="command('underline')"><Underline :size="14" /></button>
      <button type="button" title="Lista" @mousedown.prevent="command('insertUnorderedList')"><List :size="14" /></button>
      <button type="button" title="Lista numerada" @mousedown.prevent="command('insertOrderedList')"><ListOrdered :size="14" /></button>
    </div>
    <div
      ref="editor"
      class="rich-body"
      :contenteditable="disabled ? 'false' : 'true'"
      role="textbox"
      aria-multiline="true"
      aria-label="Observações"
      data-placeholder="Anotações livres desta oportunidade"
      @input="publish"
    ></div>
  </div>
</template>

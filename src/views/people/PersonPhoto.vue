<script setup lang="ts">
import { computed, ref } from 'vue'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'

const props = defineProps<{ name: string; photo?: string; personId?: string; size?: 'hero' | 'row' }>()
const store = useErpStore()
const ui = useUiStore()
const file = ref<HTMLInputElement>()
const limit = 450_000

const initials = computed(() => {
  const parts = props.name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
})

function open() {
  file.value?.click()
}

function pick(event: Event) {
  const input = event.target as HTMLInputElement
  const chosen = input.files?.[0]
  input.value = ''
  if (!chosen || !props.personId) return
  if (!chosen.type.startsWith('image/')) {
    ui.notify('error', 'Ação não concluída', 'A foto precisa ser uma imagem')
    return
  }
  if (chosen.size > limit) {
    ui.notify('error', 'Ação não concluída', `Foto de ${Math.round(chosen.size / 1024)} KB: na demonstração o limite é ${Math.round(limit / 1024)} KB`)
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    if (typeof reader.result === 'string' && props.personId) store.setPersonPhoto(props.personId, reader.result)
  }
  reader.readAsDataURL(chosen)
}

function clear() {
  if (props.personId) store.setPersonPhoto(props.personId, undefined)
}
</script>

<template>
  <div class="person-photo-slot" :class="size ?? 'hero'">
    <button v-if="personId" type="button" class="person-photo" :class="{ empty: !photo }" :aria-label="photo ? `Trocar foto de ${name}` : `Adicionar foto de ${name}`" @click="open">
      <img v-if="photo" :src="photo" :alt="`Foto de ${name}`" />
      <span v-else>{{ initials }}</span>
    </button>
    <div v-else class="person-photo" :class="{ empty: !photo }">
      <img v-if="photo" :src="photo" :alt="`Foto de ${name}`" />
      <span v-else>{{ initials }}</span>
    </div>
    <button v-if="personId" type="button" class="person-photo-action" @click="photo ? clear() : open()">{{ photo ? 'Remover' : 'Adicionar foto' }}</button>
    <input ref="file" type="file" accept="image/*" hidden @change="pick" />
  </div>
</template>

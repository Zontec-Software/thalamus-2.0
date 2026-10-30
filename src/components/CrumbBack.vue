<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'

const props = defineProps<{ fallback: string; title: string; onlyHistory?: boolean }>()
const router = useRouter()

/** Caminho anterior dentro do sistema. Vazio quando a página foi aberta direto. */
const previous = computed(() => {
  const back = window.history.state?.back
  return typeof back === 'string' && back.startsWith('/') ? back : ''
})

function go() {
  if (previous.value) router.back()
  else router.push(props.fallback)
}
</script>

<template>
  <button v-if="!onlyHistory || previous" type="button" class="crumb-back" :title="previous ? 'Voltar' : title" @click="go"><ArrowLeft :size="16" /></button>
</template>

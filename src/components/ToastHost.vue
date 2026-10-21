<script setup lang="ts">
import { CheckCircle2, Info, X, XCircle } from 'lucide-vue-next'
import { useUiStore } from '../stores/ui'

const ui = useUiStore()
const icons = { success: CheckCircle2, error: XCircle, info: Info }
</script>

<template>
  <Teleport to="body">
    <TransitionGroup name="toast" tag="div" class="toast-host">
      <div v-for="toast in ui.toasts" :key="toast.id" class="toast" :class="toast.type">
        <component :is="icons[toast.type]" :size="18" />
        <div><strong>{{ toast.title }}</strong><span v-if="toast.text">{{ toast.text }}</span></div>
        <button class="icon-plain" @click="ui.dismiss(toast.id)"><X :size="14" /></button>
      </div>
    </TransitionGroup>
  </Teleport>
</template>

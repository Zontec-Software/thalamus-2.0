<script setup lang="ts">
import { X } from 'lucide-vue-next'

withDefaults(defineProps<{ open: boolean; title: string; subtitle?: string; width?: string }>(), { width: '520px', subtitle: '' })
defineEmits<{ close: [] }>()
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="modal-backdrop" @click.self="$emit('close')">
        <section class="modal" :style="{ width }" role="dialog">
          <header class="modal-header">
            <div><h2>{{ title }}</h2><p v-if="subtitle">{{ subtitle }}</p></div>
            <button class="icon-plain" title="Fechar" @click="$emit('close')"><X :size="18" /></button>
          </header>
          <div class="modal-body"><slot /></div>
          <footer v-if="$slots.footer" class="modal-footer"><slot name="footer" /></footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

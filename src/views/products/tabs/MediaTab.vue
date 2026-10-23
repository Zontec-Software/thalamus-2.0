<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowDown, ArrowUp, FileText, Star, Upload } from 'lucide-vue-next'
import { MEDIA_KINDS, MEDIA_LIMIT_BYTES, sortedMedia } from '../../../domain/catalogExtensions'
import { useErpStore } from '../../../stores/erp'
import { useUiStore } from '../../../stores/ui'
import type { Item, ItemMedia, MediaKind } from '../../../types/domain'
import PermHint from '../PermHint.vue'
import { readOnly } from '../shared'

const props = defineProps<{ item: Item }>()
const store = useErpStore()
const ui = useUiStore()
const kind = ref<MediaKind>('Foto')
const disabled = computed(() => readOnly(props.item, ui.role, 'midia'))
const media = computed(() => sortedMedia(props.item))
const input = ref<HTMLInputElement>()
const revisionCodes = computed(() => [...new Set(store.state.productRevisions.filter(entry => entry.itemId === props.item.id).map(entry => entry.code))].sort())
const size = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

function pick(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const done = (dataUrl?: string) => {
    store.addMedia(props.item.id, { kind: kind.value, name: file.name, dataUrl, size: file.size })
    if (input.value) input.value.value = ''
  }
  if (file.size > MEDIA_LIMIT_BYTES) return done()
  const reader = new FileReader()
  reader.onload = () => done(String(reader.result))
  reader.readAsDataURL(file)
}
function download(entry: ItemMedia) {
  if (!entry.dataUrl) return
  const link = document.createElement('a')
  link.href = entry.dataUrl
  link.download = entry.name
  link.click()
}
</script>

<template>
  <PermHint :item="item" layer="midia" />
  <fieldset class="layer filter-row" :disabled="disabled" style="margin-bottom:12px">
    <select v-model="kind" class="filter"><option v-for="entry in MEDIA_KINDS" :key="entry">{{ entry }}</option></select>
    <input ref="input" type="file" :accept="kind === 'Foto' ? 'image/*' : 'image/*,application/pdf'" hidden @change="pick" />
    <button class="button small" type="button" @click="input?.click()"><Upload :size="13" /> Enviar arquivo</button>
    <span class="cell-sub">Até {{ Math.round(MEDIA_LIMIT_BYTES / 1024) }} KB por arquivo nesta demonstração. A primeira foto vira a principal.</span>
  </fieldset>

  <div v-if="media.length" class="media-grid">
    <div v-for="(entry, index) in media" :key="entry.id" class="media-card" :class="{ main: entry.main }">
      <div class="media-thumb" @click="download(entry)">
        <img v-if="entry.dataUrl && entry.dataUrl.startsWith('data:image/')" :src="entry.dataUrl" :alt="entry.name" />
        <FileText v-else :size="34" />
      </div>
      <div class="media-info">
        <b :title="entry.name">{{ entry.name }}</b>
        <span class="cell-sub">{{ entry.kind }} · {{ size(entry.size) }} · {{ entry.uploadedBy }}</span>
        <span v-if="entry.main" class="status success"><Star :size="11" /> Foto principal</span>
        <div v-if="entry.kind !== 'Foto'" class="media-usage">
          <select :value="entry.revisionCode ?? ''" class="filter" :disabled="disabled" title="Versão de engenharia do documento" @change="store.setMediaUsage(item.id, entry.id, { revisionCode: ($event.target as HTMLSelectElement).value, sendToOp: !!entry.sendToOp })">
            <option value="">Todas as versões</option>
            <option v-for="code in revisionCodes" :key="code" :value="code">Versão {{ code }}{{ code === item.revision ? ' (vigente)' : '' }}</option>
          </select>
          <label class="cell-sub"><input type="checkbox" :checked="!!entry.sendToOp" :disabled="disabled" @change="store.setMediaUsage(item.id, entry.id, { revisionCode: entry.revisionCode ?? '', sendToOp: ($event.target as HTMLInputElement).checked })" /> vai na OP</label>
          <span v-if="entry.revisionCode && item.revision && entry.revisionCode !== item.revision" class="status warning">versão antiga</span>
        </div>
      </div>
      <div class="row-actions">
        <button class="button ghost small" title="Antes" :disabled="disabled || index === 0" @click="store.moveMedia(item.id, entry.id, -1)"><ArrowUp :size="12" /></button>
        <button class="button ghost small" title="Depois" :disabled="disabled || index === media.length - 1" @click="store.moveMedia(item.id, entry.id, 1)"><ArrowDown :size="12" /></button>
        <button v-if="entry.kind === 'Foto' && !entry.main" class="button ghost small" :disabled="disabled" @click="store.setMainMedia(item.id, entry.id)">Principal</button>
        <button class="button ghost small" :disabled="disabled" @click="store.removeMedia(item.id, entry.id)">Remover</button>
      </div>
    </div>
  </div>
  <p v-else class="empty-note">Sem fotos, desenhos, fichas técnicas ou instruções de trabalho.</p>
  <p class="cell-sub">Desenho e instrução de trabalho marcados com "vai na OP" acompanham a ordem de produção da versão indicada.</p>
  <p class="cell-sub">A ordem define a sequência na vitrine e no catálogo. Desenhos e fichas acima do limite ficam só registrados (nome e tamanho); na produção, o arquivo vai para o repositório de documentos.</p>
</template>

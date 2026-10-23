<script setup lang="ts">
import { computed } from 'vue'
import { ArrowLeftRight, CloudUpload } from 'lucide-vue-next'
import { catalogOf } from '../../../domain/catalog'
import { fiscalDifferences, snapshotOf } from '../../../domain/engineering'
import { useErpStore } from '../../../stores/erp'
import { useUiStore } from '../../../stores/ui'
import type { Item } from '../../../types/domain'
import { fmtDateTime } from '../../../utils/format'
import { readOnly } from '../shared'

const props = defineProps<{ item: Item }>()
const store = useErpStore()
const ui = useUiStore()
const sync = computed(() => catalogOf(props.item).fiscalSync)
const status = computed(() => sync.value?.status ?? 'Sincronizado')
const disabled = computed(() => readOnly(props.item, ui.role, 'fiscal'))
const differences = computed(() => sync.value?.remote ? fiscalDifferences(snapshotOf(props.item), sync.value.remote) : [])
const TONE = { Sincronizado: 'success', 'Enviar ao Omie': 'warning', Conflito: 'danger' } as const

function simulate() {
  const current = catalogOf(props.item)
  store.simulateOmieFiscal(props.item.id, { origin: current.origin === '0' ? '2' : '0' })
}
</script>

<template>
  <div class="sync-panel" :class="TONE[status]" data-tour="product-fiscal-sync">
    <ArrowLeftRight :size="16" />
    <div class="sync-text">
      <strong>Omie · {{ status }}</strong>
      <span v-if="status === 'Sincronizado'">Fiscal igual nos dois lados{{ sync ? ` desde ${fmtDateTime(sync.at)} (${sync.by})` : '' }}. Alteração feita no Omie chega aqui sozinha.</span>
      <span v-else-if="status === 'Enviar ao Omie'">Alterado aqui por {{ sync?.by }} em {{ sync ? fmtDateTime(sync.at) : '' }}. Ainda não foi enviado ao Omie.</span>
      <span v-else>O Omie e o Thalamus mudaram o fiscal ao mesmo tempo. Escolha qual versão fica.</span>
    </div>
    <div class="sync-actions">
      <button v-if="status === 'Enviar ao Omie'" class="button small" :disabled="disabled" @click="store.pushFiscal(item.id)"><CloudUpload :size="13" /> Enviar ao Omie</button>
      <template v-if="status === 'Conflito'">
        <button class="button small" :disabled="disabled" @click="store.resolveFiscalConflict(item.id, 'Thalamus')">Manter o Thalamus</button>
        <button class="button secondary small" :disabled="disabled" @click="store.resolveFiscalConflict(item.id, 'Omie')">Aceitar o Omie</button>
      </template>
      <button class="button ghost small" title="Demonstração: simula alguém mudando a origem direto no Omie" @click="simulate">Simular alteração no Omie</button>
    </div>
  </div>
  <table v-if="status === 'Conflito' && differences.length" class="dense sync-diff" style="margin:-4px 0 14px">
    <thead><tr><th>Campo</th><th>No Thalamus</th><th>No Omie</th></tr></thead>
    <tbody><tr v-for="entry in differences" :key="entry.field"><td>{{ entry.field }}</td><td>{{ entry.local || '—' }}</td><td><b>{{ entry.remote || '—' }}</b></td></tr></tbody>
  </table>
</template>

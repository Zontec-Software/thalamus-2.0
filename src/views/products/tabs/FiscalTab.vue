<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { NCM_TABLE, catalogOf, gtinNcmConflict, isLocked, ncmInfo } from '../../../domain/catalog'
import { COMPANY_UF, UFS, currentReform, spedEligible, spedRegisters, suggestTaxes } from '../../../domain/catalogExtensions'
import { today } from '../../../domain/engine'
import { useErpStore } from '../../../stores/erp'
import { useUiStore } from '../../../stores/ui'
import type { FiscalOperation, Item } from '../../../types/domain'
import KeyChangeModal from '../KeyChangeModal.vue'
import PermHint from '../PermHint.vue'
import { readOnly } from '../shared'

const props = defineProps<{ item: Item }>()
const store = useErpStore()
const ui = useUiStore()
const todayIso = today()
const form = reactive({ ncm: '', exTipi: '', cest: '', origin: '0', gtinTax: '' })
const benefit = reactive({ uf: COMPANY_UF, kind: '', legalBasis: '', validTo: '' })
const reform = reactive({ cClassTrib: '', ibsReduction: 0, cbsReduction: 0, validFrom: todayIso })
const disabled = computed(() => readOnly(props.item, ui.role, 'fiscal'))
const locked = computed(() => isLocked(props.item))
const info = computed(() => ncmInfo(form.ncm))
const askNcm = ref(false)
const catalog = computed(() => catalogOf(props.item))
const service = computed(() => catalog.value.nature === 'Serviço')
const conflict = computed(() => gtinNcmConflict(props.item))
const reformRows = computed(() => [...catalog.value.reform].sort((a, b) => b.validFrom.localeCompare(a.validFrom)))
const reformNow = computed(() => currentReform(props.item))

const SCENARIOS: { operation: FiscalOperation; dest: string; label: string }[] = [
  { operation: 'Venda', dest: 'MG', label: 'Venda dentro de MG' },
  { operation: 'Venda', dest: 'SP', label: 'Venda para SP' },
  { operation: 'Venda', dest: 'RS', label: 'Venda para RS' },
  { operation: 'Venda', dest: 'GO', label: 'Venda para GO' },
  { operation: 'Transferência', dest: 'ES', label: 'Transferência para a filial ES' },
  { operation: 'Remessa para conserto', dest: 'SP', label: 'Remessa para conserto (SP)' },
]
const suggestions = computed(() => SCENARIOS.map(scenario => ({ ...scenario, result: suggestTaxes(store.state, props.item, scenario.operation, scenario.dest) })))
const sped = computed(() => spedEligible(props.item) ? spedRegisters(store.state, [props.item]) : undefined)

watch(() => [props.item.id, catalog.value.version], () => {
  Object.assign(form, { ncm: catalog.value.ncm, exTipi: catalog.value.exTipi, cest: catalog.value.cest, origin: catalog.value.origin, gtinTax: catalog.value.gtinTax })
  reform.cClassTrib = catalog.value.cClassTrib
}, { immediate: true })
watch(() => form.ncm, () => { if (info.value?.st && !form.cest) form.cest = info.value.cest })

function addBenefit() {
  if (store.addBenefit(props.item.id, { ...benefit, validTo: benefit.validTo || undefined }) !== undefined) Object.assign(benefit, { kind: '', legalBasis: '', validTo: '' })
}
const br = (date?: string) => date ? date.split('-').reverse().join('/') : '—'
</script>

<template>
  <PermHint :item="item" layer="fiscal" />
  <p v-if="!service && !catalog.ncm && locked" class="notice warning">Item ativo sem NCM: o envio ao Omie falha até o fiscal completar. Como o item já está ativo, o NCM entra por exceção.</p>
  <p v-if="conflict" class="notice warning">GTIN × NCM: o CCG registra o EAN {{ catalog.gtin }} com NCM {{ conflict }}. A NF-e é rejeitada quando os dois não batem. Corrija o NCM (por exceção) ou o EAN.</p>
  <fieldset class="layer" :disabled="disabled">
    <div class="form-grid">
      <div v-if="!service" class="field"><label>NCM</label>
        <select v-model="form.ncm" :disabled="locked"><option value="">Sem NCM</option><option v-for="entry in NCM_TABLE" :key="entry.code" :value="entry.code">{{ entry.code }} · {{ entry.name }}</option></select>
        <small v-if="locked">Congelado depois da ativação. <button class="button ghost small" type="button" @click="askNcm = true">Solicitar exceção</button></small>
        <small v-else>{{ info?.st ? 'Sujeito a substituição tributária: CEST obrigatório.' : 'Validado contra a tabela oficial.' }}</small>
      </div>
      <div v-if="!service" class="field"><label>Ex-TIPI</label><input v-model="form.exTipi" inputmode="numeric" maxlength="3" placeholder="Só se houver exceção" /><small>Exceção da TIPI que muda a alíquota de IPI do NCM.</small></div>
      <div v-if="!service" class="field"><label>CEST</label><input v-model="form.cest" :placeholder="info?.cest || 'Só quando houver ST'" /></div>
      <div v-if="!service" class="field"><label>Origem</label>
        <select v-model="form.origin"><option value="0">0 · Nacional</option><option value="1">1 · Estrangeira, importação direta</option><option value="2">2 · Estrangeira, mercado interno</option></select>
      </div>
      <div v-if="!service" class="field"><label>GTIN tributável</label><input v-model="form.gtinTax" inputmode="numeric" /><small>Preencha só se for diferente do EAN principal.</small></div>
      <div class="field"><label>cClassTrib vigente</label><input :value="catalog.cClassTrib" disabled /><small>Vem da camada da reforma abaixo, pela vigência.</small></div>
    </div>
    <button class="button" @click="store.updateItemFiscal(item.id, { ...form })">Salvar fiscal</button>
  </fieldset>

  <h3 class="drawer-title">Reforma tributária (IBS/CBS)</h3>
  <p class="cell-sub">Camada própria, com vigência, para a transição 2026–2033. Convive com ICMS e IPI sem misturar.</p>
  <table v-if="reformRows.length" class="dense">
    <thead><tr><th>Vigência</th><th>cClassTrib</th><th>Redução IBS</th><th>Redução CBS</th><th>Lançado por</th><th /></tr></thead>
    <tbody>
      <tr v-for="entry in reformRows" :key="entry.id">
        <td>{{ br(entry.validFrom) }}</td><td><span class="code">{{ entry.cClassTrib }}</span></td><td>{{ entry.ibsReduction }}%</td><td>{{ entry.cbsReduction }}%</td>
        <td><span class="cell-sub">{{ entry.createdBy }}</span></td>
        <td>
          <span v-if="entry.id === reformNow?.id" class="status success">Vigente</span>
          <template v-else-if="entry.validFrom > todayIso"><span class="status info">Programada</span> <button class="button ghost small" :disabled="disabled" @click="store.removeReformEntry(item.id, entry.id)">Cancelar</button></template>
          <span v-else class="status neutral">Histórico</span>
        </td>
      </tr>
    </tbody>
  </table>
  <p v-else class="empty-note">Sem entradas: vale o cClassTrib padrão {{ catalog.cClassTrib }}.</p>
  <form class="filter-row" style="margin-top:8px" @submit.prevent="store.addReformEntry(item.id, { ...reform })">
    <fieldset class="layer filter-row" :disabled="disabled">
      <input v-model="reform.cClassTrib" class="filter narrow" maxlength="6" placeholder="cClassTrib" required />
      <label class="cell-sub">IBS −<input v-model.number="reform.ibsReduction" class="filter narrow" type="number" min="0" max="100" />%</label>
      <label class="cell-sub">CBS −<input v-model.number="reform.cbsReduction" class="filter narrow" type="number" min="0" max="100" />%</label>
      <label class="cell-sub">desde <input v-model="reform.validFrom" class="filter" type="date" :min="todayIso" /></label>
      <button class="button small" type="submit">Programar</button>
    </fieldset>
  </form>

  <template v-if="!service">
    <h3 class="drawer-title">Benefícios fiscais por UF</h3>
    <table v-if="catalog.benefits.length" class="dense">
      <thead><tr><th>UF</th><th>Benefício</th><th>Base legal</th><th>Validade</th><th /></tr></thead>
      <tbody>
        <tr v-for="entry in catalog.benefits" :key="entry.id">
          <td>{{ entry.uf }}</td><td>{{ entry.kind }}</td><td><span class="cell-sub">{{ entry.legalBasis }}</span></td>
          <td><span class="status" :class="entry.validTo && entry.validTo < todayIso ? 'danger' : 'neutral'">{{ entry.validTo ? br(entry.validTo) : 'Sem prazo' }}</span></td>
          <td><button class="button ghost small" :disabled="disabled" @click="store.removeBenefit(item.id, entry.id)">Remover</button></td>
        </tr>
      </tbody>
    </table>
    <p v-else class="empty-note">Nenhum benefício cadastrado.</p>
    <form class="filter-row" style="margin-top:8px" @submit.prevent="addBenefit">
      <fieldset class="layer filter-row" :disabled="disabled">
        <select v-model="benefit.uf" class="filter narrow"><option v-for="uf in UFS" :key="uf">{{ uf }}</option></select>
        <input v-model="benefit.kind" class="filter" placeholder="Benefício (ex.: redução de base)" required />
        <input v-model="benefit.legalBasis" class="filter grow" placeholder="Base legal" required />
        <input v-model="benefit.validTo" class="filter" type="date" :min="todayIso" title="Validade" />
        <button class="button small" type="submit">Incluir</button>
      </fieldset>
    </form>
  </template>

  <h3 class="drawer-title">Tributação sugerida pela matriz fiscal</h3>
  <p class="cell-sub">O item sugere, a operação decide. A regra mais específica (NCM, UF de destino) vence. A matriz espelha a do Omie e é mantida em Fiscal → Matriz fiscal.</p>
  <table class="dense">
    <thead><tr><th>Cenário</th><th>CFOP</th><th>CST ICMS</th><th>ICMS</th><th>IPI</th><th>PIS/COFINS</th><th>Regra</th></tr></thead>
    <tbody>
      <tr v-for="row in suggestions" :key="row.label">
        <td>{{ row.label }}<span v-if="row.result?.benefits.length" class="cell-sub">benefício: {{ row.result.benefits.map(entry => entry.kind).join(', ') }}</span></td>
        <template v-if="row.result">
          <td>{{ row.result.rule.cfop }}</td><td><span class="code">{{ row.result.cst }}</span></td><td>{{ row.result.rule.icms }}%</td>
          <td>{{ row.result.rule.ipi }}%{{ catalog.exTipi ? ` (Ex ${catalog.exTipi})` : '' }}</td><td>{{ row.result.rule.pis }}% / {{ row.result.rule.cofins }}%</td>
          <td><span class="cell-sub">{{ row.result.rule.id }} · NCM {{ row.result.rule.ncmPrefix || 'qualquer' }} · {{ row.result.rule.originUf }}→{{ row.result.rule.destUf }}</span></td>
        </template>
        <td v-else colspan="6"><span class="status warning">Sem regra na matriz: o Omie recusa a NF-e</span></td>
      </tr>
    </tbody>
  </table>

  <h3 class="drawer-title">SPED · registros do item</h3>
  <pre v-if="sped" class="code-block">{{ sped.lines.join('\n') }}</pre>
  <p v-else class="empty-note">Rascunho, homologação e kit virtual não entram no Bloco 0 do SPED.</p>
  <p v-if="sped?.issues.length" class="notice warning">{{ sped.issues.join(' · ') }}</p>
  <KeyChangeModal :open="askNcm" :item="item" field="ncm" @close="askNcm = false" />
</template>

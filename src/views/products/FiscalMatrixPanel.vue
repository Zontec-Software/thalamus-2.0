<script setup lang="ts">
import { computed, reactive } from 'vue'
import { canEdit, editorsLabel } from '../../domain/catalog'
import { FISCAL_OPERATIONS, UFS } from '../../domain/catalogExtensions'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import type { FiscalOperation } from '../../types/domain'

const store = useErpStore()
const ui = useUiStore()
const allowed = computed(() => canEdit(ui.role, 'fiscal'))
const form = reactive({ operation: 'Venda' as FiscalOperation, originUf: 'MG', destUf: '*', ncmPrefix: '', cfop: '', cst: '00', icms: 0, ipi: 0, pis: 1.65, cofins: 7.6 })
const rules = computed(() => [...store.state.fiscalRules].sort((a, b) => a.operation.localeCompare(b.operation) || a.destUf.localeCompare(b.destUf) || b.ncmPrefix.length - a.ncmPrefix.length))

function add() {
  if (store.addFiscalRule({ ...form }) !== undefined) Object.assign(form, { ncmPrefix: '', cfop: '' })
}
</script>

<template>
  <article class="card flush">
    <div class="section-head"><div><h2>Matriz fiscal</h2><p>Espelho da matriz do Omie. O item só sugere: a regra mais específica (NCM mais longo, depois UF exata) define CFOP, CST e alíquotas da operação.</p></div>
      <span class="status neutral">{{ rules.length }} regra(s)</span>
    </div>
    <table class="dense">
      <thead><tr><th>Operação</th><th>Origem → destino</th><th>NCM</th><th>CFOP</th><th>CST ICMS</th><th>ICMS</th><th>IPI</th><th>PIS / COFINS</th><th /></tr></thead>
      <tbody>
        <tr v-for="rule in rules" :key="rule.id">
          <td>{{ rule.operation }}</td>
          <td>{{ rule.originUf }} → {{ rule.destUf === '*' ? 'demais UFs' : rule.destUf }}</td>
          <td><span class="code">{{ rule.ncmPrefix || 'qualquer' }}</span></td>
          <td>{{ rule.cfop }}</td>
          <td>origem + {{ rule.cst }}</td>
          <td>{{ rule.icms }}%</td><td>{{ rule.ipi }}%</td><td>{{ rule.pis }}% / {{ rule.cofins }}%</td>
          <td><button class="button ghost small" :disabled="!allowed" @click="store.removeFiscalRule(rule.id)">Remover</button></td>
        </tr>
      </tbody>
    </table>
    <form class="filter-row" style="padding:10px 16px" @submit.prevent="add">
      <fieldset class="layer filter-row" :disabled="!allowed">
        <select v-model="form.operation" class="filter"><option v-for="entry in FISCAL_OPERATIONS" :key="entry">{{ entry }}</option></select>
        <select v-model="form.originUf" class="filter narrow"><option v-for="uf in UFS" :key="uf">{{ uf }}</option></select>
        <select v-model="form.destUf" class="filter narrow"><option value="*">Demais</option><option v-for="uf in UFS" :key="uf">{{ uf }}</option></select>
        <input v-model="form.ncmPrefix" class="filter narrow" placeholder="NCM (prefixo)" />
        <input v-model="form.cfop" class="filter narrow" placeholder="CFOP" required />
        <input v-model="form.cst" class="filter narrow" placeholder="CST" maxlength="2" required />
        <label class="cell-sub">ICMS <input v-model.number="form.icms" class="filter narrow" type="number" min="0" max="100" step="0.01" /></label>
        <label class="cell-sub">IPI <input v-model.number="form.ipi" class="filter narrow" type="number" min="0" max="100" step="0.01" /></label>
        <button class="button small" type="submit">Incluir regra</button>
      </fieldset>
    </form>
    <p v-if="!allowed" class="cell-sub" style="padding:0 16px 12px">Quem mantém a matriz: {{ editorsLabel('fiscal') }}.</p>
  </article>
</template>

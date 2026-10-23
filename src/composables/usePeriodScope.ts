import { computed, ref, watch } from 'vue'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'

/**
 * Ano, intervalo de meses e empresa ou grupo vistos numa tela de Finanças.
 * Outra empresa do grupo e a soma só valem com a consulta consolidada; sem ela, a tela fica na empresa ativa.
 */
export function usePeriodScope(initialYear = '2026') {
  const store = useErpStore()
  const ui = useUiStore()
  const year = ref(initialYear)
  const fromMonth = ref(1)
  const toMonth = ref(12)
  const scope = ref(ui.activeTenantId)
  watch(() => ui.activeTenantId, id => { scope.value = id })

  const members = computed(() => {
    const groupId = store.state.tenants.find(entry => entry.id === ui.activeTenantId)?.groupId
    return groupId ? store.state.tenants.filter(entry => entry.groupId === groupId && entry.status === 'Ativa') : []
  })
  const canGroup = computed(() => store.can('orcamentos.consultar_consolidado'))
  const groupView = computed(() => canGroup.value && scope.value === 'grupo' && members.value.length > 1)
  const tenantIds = computed(() => {
    if (groupView.value) return members.value.map(entry => entry.id)
    if (canGroup.value && members.value.some(entry => entry.id === scope.value)) return [scope.value]
    return [ui.activeTenantId]
  })
  const viewingTenantId = computed(() => groupView.value ? '' : tenantIds.value[0])
  const scopeLabel = computed(() => {
    if (groupView.value) {
      const group = store.state.economicGroups.find(entry => entry.id === members.value[0]?.groupId)
      return `${group?.name ?? 'Grupo'} · soma das empresas`
    }
    return store.state.tenants.find(entry => entry.id === tenantIds.value[0])?.tradeName ?? ''
  })
  const fullYear = computed(() => fromMonth.value === 1 && toMonth.value === 12)

  return { year, fromMonth, toMonth, scope, members, groupView, tenantIds, viewingTenantId, scopeLabel, fullYear }
}

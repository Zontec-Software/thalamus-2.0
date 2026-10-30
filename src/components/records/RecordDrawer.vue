<script setup lang="ts">
import { computed, type Component } from 'vue'
import { useUiStore, type RecordKind } from '../../stores/ui'
import AssetRecord from './AssetRecord.vue'
import BudgetRecord from './BudgetRecord.vue'
import DemandRecord from './DemandRecord.vue'
import PersonRecord from './PersonRecord.vue'
import ProjectRecord from './ProjectRecord.vue'
import ProposalRecord from './ProposalRecord.vue'
import PurchaseRecord from './PurchaseRecord.vue'
import TechnicalRecord from './TechnicalRecord.vue'

const ui = useUiStore()
const VIEWS: Record<RecordKind, Component> = {
  proposal: ProposalRecord, demand: DemandRecord, purchase: PurchaseRecord, technical: TechnicalRecord,
  project: ProjectRecord, budget: BudgetRecord, person: PersonRecord, asset: AssetRecord,
}
const view = computed(() => ui.record ? VIEWS[ui.record.kind] : undefined)
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div v-if="ui.record && view" class="drawer-backdrop" @click.self="ui.closeRecord">
        <aside class="drawer">
          <component :is="view" :id="ui.record.id" :key="`${ui.record.kind}-${ui.record.id}`" :context="ui.record.context ?? {}" />
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EFFORT_PROFILES, effortSnapshot } from '../../domain/crmEffort'
import type { EffortWeek } from '../../domain/crmEffort'
import { useErpStore } from '../../stores/erp'
import type { SellerLink } from '../../types/domain'

const props = defineProps<{ link: SellerLink; week: EffortWeek; title?: string }>()
const store = useErpStore()
const snapshot = computed(() => effortSnapshot(store.state, props.link, props.week))
const name = computed(() => store.userName(props.link.userId))
</script>

<template>
  <article class="card">
    <div class="section-head" style="margin-top:0">
      <div>
        <h2>{{ title ?? name }}</h2>
        <p>{{ EFFORT_PROFILES[link.profile] }} · semana de {{ week.label }}. Verde com {{ snapshot.greenAt }} de 4 indicadores.</p>
      </div>
      <span v-if="snapshot.score === null" class="status">Sem registro na semana</span>
      <span v-else class="status" :class="snapshot.green ? 'success' : 'warning'">{{ snapshot.score }} de 4 · {{ snapshot.green ? 'semana verde' : 'abaixo da régua' }}</span>
    </div>
    <ul class="effort-list">
      <li v-for="item in snapshot.indicators" :key="item.id" :class="{ hit: item.hit, miss: item.scored && !item.hit }">
        <b>{{ item.label }}</b>
        <span>{{ item.value }}<template v-if="item.scored"> de {{ item.target }}</template><template v-else> · {{ item.target === 'A calibrar' ? 'meta a calibrar' : 'sem casos' }}</template></span>
        <small>{{ item.basis || item.description }}</small>
      </li>
    </ul>
    <p v-if="snapshot.pending || snapshot.returned" class="cell-sub">
      <template v-if="snapshot.pending">{{ snapshot.pending }} registro(s) em conferência, fora do placar. </template>
      <template v-if="snapshot.returned">{{ snapshot.returned }} devolvido(s), aguardando correção.</template>
    </p>
  </article>
</template>

<style scoped>
.effort-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.effort-list li { display: grid; grid-template-columns: 1.4fr 0.8fr 2fr; gap: 12px; align-items: baseline; padding: 8px 10px; border-radius: 8px; background: var(--surface-2, #f3f5f9); border-left: 4px solid #c9cfda; }
.effort-list li.hit { border-left-color: #36703e; }
.effort-list li.miss { border-left-color: #b4452f; }
.effort-list small { color: var(--muted, #667); }
@media (max-width: 760px) { .effort-list li { grid-template-columns: 1fr; } }
</style>

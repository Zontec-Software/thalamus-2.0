<script setup lang="ts">
import { computed } from 'vue'
import { BriefcaseBusiness, SquareUser } from 'lucide-vue-next'
import { occupantsAt } from '../../domain/organization'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'

withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })

const store = useErpStore()
const ui = useUiStore()

const sample = computed(() => {
  const positions = store.state.positions.filter(entry => entry.tenantId === ui.activeTenantId)
  const position = [...positions].sort((a, b) => b.headcount - a.headcount)[0]
  if (!position) return undefined
  const job = store.state.jobs.find(entry => entry.id === position.jobId)
  const sector = store.state.sectors.find(entry => entry.id === position.sectorId)
  const boss = store.state.positions.find(entry => entry.id === position.parentPositionId)
  const names = occupantsAt(store.state, position.id)
    .map(entry => store.state.users.find(user => user.id === entry.userId)?.name)
    .filter((name): name is string => !!name)
  return { position, job, sector, boss, names }
})

const places = (count: number) => count === 1 ? '1 vaga' : `${count} vagas`
</script>

<template>
  <aside class="role-vs" :class="{ compact }">
    <p class="role-vs-lead">O cargo descreve o trabalho. A posição é a vaga desse trabalho dentro de um setor.</p>
    <div class="role-vs-cols">
      <div>
        <b><BriefcaseBusiness :size="15" /> Cargo</b>
        <span>Fica no catálogo, uma vez só. Guarda a missão, o nível, o CBO e o que a pessoa precisa saber.</span>
      </div>
      <div>
        <b><SquareUser :size="15" /> Posição</b>
        <span>É a vaga. Fica num setor, usa um cargo, tem um chefe e um número de lugares. O mesmo cargo serve para várias posições.</span>
      </div>
    </div>
    <p v-if="sample && !compact" class="role-vs-example">
      Nesta empresa, o cargo <strong>{{ sample.job?.name ?? sample.position.name }}</strong><template v-if="sample.job?.mission"> descreve «{{ sample.job.mission }}»</template>.
      A posição com esse cargo fica em <strong>{{ sample.sector?.name ?? 'um setor' }}</strong> e oferece {{ places(sample.position.headcount) }}<template v-if="sample.boss">, respondendo a {{ sample.boss.name }}</template>.
      <template v-if="sample.names.length === 1 && sample.position.headcount === 1">Hoje {{ sample.names[0] }} ocupa essa vaga.</template><template v-else-if="sample.names.length">Hoje {{ sample.names.join(' e ') }} {{ sample.names.length === 1 ? 'ocupa' : 'ocupam' }} {{ sample.names.length }} de {{ sample.position.headcount }}.</template><template v-else>Nenhuma está ocupada.</template>
    </p>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { BriefcaseBusiness, SquareUser, UserRound } from 'lucide-vue-next'
import { occupantsAt } from '../../domain/organization'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'

withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })

const store = useErpStore()
const ui = useUiStore()

const sample = computed(() => {
  const positions = store.state.positions.filter(entry => entry.tenantId === ui.activeTenantId && entry.status === 'Ativo')
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
    <p class="role-vs-lead">A pessoa ocupa uma posição. O cargo é o dessa vaga, não um campo da ficha.</p>
    <div class="role-vs-cols">
      <div>
        <b><BriefcaseBusiness :size="15" /> Cargo</b>
        <span>Descreve o trabalho, uma vez, em Cargos: missão, nível, CBO e requisitos. Não tem chefe nem lugar vazio.</span>
      </div>
      <div>
        <b><SquareUser :size="15" /> Posição</b>
        <span>É a vaga no organograma. Fica num setor, usa um cargo, responde a outra vaga e tem um número de lugares. Pode estar livre.</span>
      </div>
      <div>
        <b><UserRound :size="15" /> Pessoa</b>
        <span>Ocupa a vaga. O cargo dela é o cargo da posição. Trocar quem ocupa não troca o cargo.</span>
      </div>
    </div>
    <p v-if="sample && !compact" class="role-vs-example">
      Nesta empresa, o cargo <strong>{{ sample.job?.name ?? sample.position.name }}</strong><template v-if="sample.job?.mission"> descreve «{{ sample.job.mission }}»</template>.
      A posição com esse cargo fica em <strong>{{ sample.sector?.name ?? 'um setor' }}</strong> e oferece {{ places(sample.position.headcount) }}<template v-if="sample.boss">, respondendo a {{ sample.boss.name }}</template>.
      <template v-if="sample.names.length === 1 && sample.position.headcount === 1">Hoje {{ sample.names[0] }} ocupa essa vaga. Se sair, a vaga e o cargo continuam.</template><template v-else-if="sample.names.length">Hoje {{ sample.names.join(' e ') }} {{ sample.names.length === 1 ? 'ocupa' : 'ocupam' }} {{ sample.names.length }} de {{ sample.position.headcount }}. Quem sair não leva o cargo embora.</template><template v-else>A vaga está livre e já tem o cargo.</template>
    </p>
  </aside>
</template>

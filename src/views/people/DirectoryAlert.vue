<script setup lang="ts">
import { computed } from 'vue'
import { directoryFailures } from '../../domain/directory'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'

const store = useErpStore()
const ui = useUiStore()
const failures = computed(() => directoryFailures(store.state, ui.activeTenantId))

function href(personId: string) {
  const user = store.state.users.find(entry => entry.personId === personId)
  const process = store.state.offboardings.find(entry => entry.userId === user?.id && entry.tenantId === ui.activeTenantId && entry.status === 'Em andamento')
  const account = failures.value.find(entry => entry.personId === personId)
  if (process && account?.pendingAction === 'Suspender') return `/pessoas/desligamento/${process.id}?aba=acessos`
  return `/pessoas/pessoa/${personId}?aba=acesso`
}
</script>

<template>
  <div v-if="failures.length" class="callout warn directory-alert">
    <div>
      <strong>Conta Google com falha</strong>
      <p v-for="entry in failures" :key="entry.id">
        <RouterLink :to="href(entry.personId)">{{ store.state.persons.find(person => person.id === entry.personId)?.fullName }}</RouterLink>
        · {{ entry.failure }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Bell, BookOpen, ChevronDown, CircleHelp, Compass, House, RotateCcw, Search } from 'lucide-vue-next'
import BrandMark from './components/BrandMark.vue'
import OpDrawer from './components/OpDrawer.vue'
import OrderDrawer from './components/OrderDrawer.vue'
import RecordDrawer from './components/records/RecordDrawer.vue'
import ToastHost from './components/ToastHost.vue'
import TourGuide from './components/TourGuide.vue'
import { allocationOf } from './domain/budget'
import { AREAS, areaOf, moduleFeature, moduleOf, owns } from './navigation'
import { useErpStore } from './stores/erp'
import { useUiStore } from './stores/ui'
import { PAGE_TOURS, WELCOME_KEY, WELCOME_TOUR, tourKey } from './tour/steps'
import type { BudgetAlert } from './types/domain'
import { fmtCurrency, fmtTime } from './utils/format'

const route = useRoute()
const router = useRouter()
const store = useErpStore()
const ui = useUiStore()

const isTablet = computed(() => route.meta.layout === 'tablet')
const isHome = computed(() => route.path === '/')
const currentArea = computed(() => areaOf(route.path))
const query = ref('')
const searchOpen = ref(false)
const helpOpen = ref(false)
const bellOpen = ref(false)
const areaOpen = ref(false)

const allowed = (module?: string) => !module || store.can(moduleFeature(module))
const canPreview = computed(() => store.isAccessAdministrator())
const areas = computed(() => AREAS.flatMap(area => {
  const to = area.groups.flatMap(group => group.items).find(item => allowed(item.module) && item.to !== '/tablet')?.to
  return to ? [{ ...area, to }] : []
}))
const navigation = computed(() => (currentArea.value?.groups ?? [])
  .map(group => ({ ...group, items: group.items.filter(item => allowed(item.module)) }))
  .filter(group => group.items.length))

const openAlerts = computed(() => store.state.alerts.filter(alert => !alert.resolved))
const budgetDecisions = computed(() => store.state.budgetExceptions.filter(entry => entry.tenantId === ui.activeTenantId && entry.status === 'Pendente' && entry.kind === 'Saldo excedido' && store.can('orcamentos.liberar_saldo')))
const budgetNotices = computed(() => store.state.budgetAlerts.filter(entry => {
  if (entry.tenantId !== ui.activeTenantId) return false
  if (entry.status !== 'Aberto') return false
  if (!store.can('orcamentos.gerir') && !(entry.notifiedUserIds ?? []).includes(ui.sessionUserId)) return false
  if (entry.kind === 'Bloqueio' && budgetDecisions.value.some(item => item.sourceId === entry.sourceId)) return false
  return true
}))
const noticeCount = computed(() => openAlerts.value.length + budgetDecisions.value.length + budgetNotices.value.length)
const decisionNotes = reactive<Record<string, string>>({})
function decideBudget(id: string, approve: boolean) {
  if (store.decideBudgetException(id, approve, decisionNotes[id] || '')) delete decisionNotes[id]
}
function budgetCategoryName(id: string) {
  return store.state.budgetCategories.find(entry => entry.id === id)?.name ?? id
}
function openExceptions() {
  bellOpen.value = false
  ui.budgetTab = 'acoes'
  router.push('/orcamentos')
}
function openBudgetNotice(alert: BudgetAlert) {
  bellOpen.value = false
  ui.budgetTab = 'visao'
  const allocation = allocationOf(store.state, alert.categoryId, alert.period)
  router.push('/orcamentos')
  if (allocation) ui.openRecord('budget', allocation.id, { window: alert.period })
}
const syncErrors = computed(() => store.state.syncLogs.filter(entry => entry.status === 'erro').length)
const lastSync = computed(() => store.state.syncLogs[0]?.at)

const results = computed(() => {
  const term = query.value.trim().toLowerCase()
  if (term.length < 2) return []
  const has = (...values: string[]) => values.some(value => value.toLowerCase().includes(term))
  return [
    ...store.state.salesOrders.filter(order => has(order.id, order.omieId, store.customerName(order.customerId))).map(order => ({ key: order.id, type: 'Pedido', title: order.id, text: `${store.customerName(order.customerId)} · ${store.stage(order)}`, open: () => { ui.orderDrawer = order.id } })),
    ...store.state.productionOrders.filter(op => has(op.id, store.itemLabel(op.itemId))).map(op => ({ key: op.id, type: 'OP', title: op.id, text: `${store.itemLabel(op.itemId)} · ${op.status}`, open: () => { ui.opDrawer = op.id } })),
    ...store.state.items.filter(item => has(item.code, item.name)).map(item => ({ key: item.id, type: 'Item', title: item.code, text: store.itemLabel(item.id), open: () => router.push(`/produtos/item/${item.id}`) })),
    ...store.state.requisitions.filter(req => has(req.id, req.omiePo ?? '')).map(req => ({ key: req.id, type: 'Compra', title: req.id, text: `${store.itemLabel(req.itemId)} · ${req.status}`, open: () => router.push('/compras') })),
    ...store.state.opportunities.filter(entry => has(entry.id, entry.title, store.partnerName(entry.partnerId))).map(entry => ({ key: entry.id, type: 'CRM', title: entry.id, text: `${entry.title} · ${entry.stage}`, open: () => ui.openRecord('opportunity', entry.id) })),
    ...store.state.proposals.filter(entry => has(entry.id, store.partnerName(entry.partnerId))).map(entry => ({ key: entry.id, type: 'Proposta', title: entry.id, text: `${store.partnerName(entry.partnerId)} · ${entry.status}`, open: () => ui.openRecord('proposal', entry.id) })),
    ...store.state.demands.filter(entry => has(entry.id, entry.description)).map(entry => ({ key: entry.id, type: 'Demanda', title: entry.id, text: `${entry.description} · ${entry.status}`, open: () => ui.openRecord('demand', entry.id) })),
    ...store.state.purchaseOrders.filter(entry => has(entry.id, store.partnerName(entry.supplierId))).map(entry => ({ key: entry.id, type: 'Pedido de compra', title: entry.id, text: `${store.partnerName(entry.supplierId)} · ${entry.status}`, open: () => ui.openRecord('purchase', entry.id) })),
    ...store.state.technicalServiceOrders.filter(entry => has(entry.id, entry.description, store.partnerName(entry.partnerId), entry.assetSerial ?? '')).map(entry => ({ key: entry.id, type: 'Assistência', title: entry.id, text: `${entry.description} · ${entry.status}`, open: () => ui.openRecord('technical', entry.id) })),
    ...store.state.projects.filter(entry => has(entry.id, entry.name)).map(entry => ({ key: entry.id, type: 'Projeto', title: entry.id, text: `${entry.name} · ${entry.status}`, open: () => ui.openRecord('project', entry.id) })),
    ...store.state.users.filter(entry => has(entry.name)).map(entry => ({ key: entry.id, type: 'Pessoa', title: entry.name, text: `${entry.role} · ${entry.sector}`, open: () => ui.openRecord('person', entry.id) })),
    ...store.state.assets.filter(entry => has(entry.name, entry.serial ?? '')).map(entry => ({ key: entry.id, type: 'Ativo', title: entry.name, text: entry.kind, open: () => ui.openRecord('asset', entry.id) })),
  ].slice(0, 8)
})

function closeSearchSoon() {
  setTimeout(() => { searchOpen.value = false }, 180)
}

function pick(result: { open: () => void }) {
  result.open()
  query.value = ''
  searchOpen.value = false
}

function changeProfile(profileId: string) {
  store.previewProfile(profileId || null)
  const profile = profileId ? store.state.accessProfiles.find(entry => entry.id === profileId) : undefined
  ui.notify('info', profile ? `Visualizando como ${profile.name}` : 'Visualização administrativa restaurada', profile ? 'Isto não altera os acessos reais do usuário' : undefined)
  if (!allowed(moduleOf(route.path))) router.push('/')
}

function pageTour() {
  helpOpen.value = false
  const key = tourKey(route.path)
  const steps = PAGE_TOURS[key]
  if (steps) ui.startTour(key, steps)
  else ui.notify('info', 'Esta tela não possui guia específico')
}

function welcomeTour() {
  helpOpen.value = false
  if (route.path !== '/') router.push('/')
  setTimeout(() => ui.startTour(WELCOME_KEY, WELCOME_TOUR), 300)
}

function restartGuides() {
  helpOpen.value = false
  ui.resetTours()
  ui.notify('success', 'Guias reativados', 'Cada tela exibirá seu guia novamente na próxima visita')
}

function maybeStartTour() {
  setTimeout(() => {
    if (ui.tourSteps.length || isTablet.value && !ui.seenTours.includes(WELCOME_KEY)) return
    if (!ui.seenTours.includes(WELCOME_KEY)) {
      if (route.path === '/') ui.startTour(WELCOME_KEY, WELCOME_TOUR)
      return
    }
    const key = tourKey(route.path)
    const steps = PAGE_TOURS[key]
    if (steps && !ui.seenTours.includes(key)) ui.startTour(key, steps)
  }, 700)
}

function openPlatform() {
  store.enterPlatform()
  router.push('/plataforma')
}
watch(() => route.path, () => { areaOpen.value = false; maybeStartTour() }, { immediate: true })
watch(() => store.isPlatformMaster(), master => {
  if (master && route.path !== '/plataforma' && !route.path.startsWith('/ajuda')) router.replace('/plataforma')
})
watch(() => ui.tourSteps.length, length => { if (length === 0) maybeStartTour() })
</script>

<template>
  <RouterView v-if="isTablet" />
  <div v-else class="app-shell" :class="{ home: isHome }">
    <main class="main">
      <header class="topbar">
        <div class="topbar-left">
          <RouterLink to="/" class="brand topbar-brand" title="Voltar ao início">
            <BrandMark />
            <div><strong>Thalamus</strong><span>{{ store.isPlatformMaster() ? 'Plataforma' : (store.state.tenants.find(entry => entry.id === ui.activeTenantId)?.tradeName ?? 'Empresa') }}</span></div>
          </RouterLink>
          <div v-if="!isHome" class="title-block">
          <button class="area-switch" @click.stop="areaOpen = !areaOpen; helpOpen = false; bellOpen = false">
            <component :is="currentArea?.icon" v-if="currentArea" :size="13" />
            {{ currentArea?.label ?? route.meta.eyebrow }}
            <ChevronDown :size="13" />
          </button>
          <h1>{{ route.meta.title }}</h1>
          <div v-if="areaOpen" class="dropdown area-menu">
            <RouterLink to="/"><House :size="16" /> Início</RouterLink>
            <RouterLink v-for="area in areas" :key="area.id" :to="area.to" :class="{ current: area.id === currentArea?.id }">
              <component :is="area.icon" :size="16" /> {{ area.label }}
            </RouterLink>
          </div>
          </div>
        </div>
        <div class="topbar-actions">
          <div class="search-wrap" data-tour="search">
            <label class="global-search"><Search :size="16" /><input v-model="query" placeholder="Buscar pedido, cliente, demanda, projeto…" @focus="searchOpen = true" @blur="closeSearchSoon" /></label>
            <div v-if="searchOpen && results.length" class="dropdown search-results">
              <button v-for="result in results" :key="result.type + result.key" @mousedown.prevent="pick(result)">
                <span class="status neutral">{{ result.type }}</span>
                <div><strong>{{ result.title }}</strong><small>{{ result.text }}</small></div>
              </button>
            </div>
            <div v-else-if="searchOpen && query.length >= 2" class="dropdown search-results"><p class="empty-note">Nada encontrado para “{{ query }}”</p></div>
          </div>

          <label v-if="canPreview" class="role-switch" data-tour="role">
            <span>Visualizar como</span>
            <select :value="ui.previewProfileId ?? ''" @change="changeProfile(($event.target as HTMLSelectElement).value)">
              <option value="">Administrador</option>
              <option v-for="profile in store.state.accessProfiles.filter(entry => !entry.system && entry.tenantId === ui.activeTenantId)" :key="profile.id" :value="profile.id">{{ profile.name }}</option>
            </select>
          </label>

          <div class="menu-wrap">
            <button class="icon-button" title="Notificações" @click="bellOpen = !bellOpen; helpOpen = false; areaOpen = false">
              <Bell :size="18" /><b v-if="noticeCount" class="badge-count">{{ noticeCount }}</b>
            </button>
            <div v-if="bellOpen" class="dropdown menu-dropdown wide" @click.stop>
              <template v-if="budgetDecisions.length">
                <p class="dropdown-title">Liberar lançamento acima do saldo</p>
                <div v-for="entry in budgetDecisions" :key="entry.id" class="decision-item" @click="openExceptions">
                  <strong>{{ entry.sourceId }} · {{ fmtCurrency(entry.amount) }}</strong>
                  <small>{{ entry.description }}</small>
                  <input v-model="decisionNotes[entry.id]" class="filter" placeholder="Justificativa" @click.stop />
                  <div class="row-end" @click.stop>
                    <button class="button small" @click="decideBudget(entry.id, true)">Liberar</button>
                    <button class="button danger small" @click="decideBudget(entry.id, false)">Rejeitar</button>
                  </div>
                </div>
              </template>
              <template v-if="budgetNotices.length">
                <p class="dropdown-title">Orçamento no limiar</p>
                <div v-for="entry in budgetNotices" :key="entry.id" class="decision-item" @click="openBudgetNotice(entry)">
                  <strong>{{ budgetCategoryName(entry.categoryId) }} · {{ entry.period }}</strong>
                  <small>{{ entry.message }}</small>
                  <div class="row-end" @click.stop>
                    <button class="button small" @click="store.acknowledgeBudgetAlert(entry.id)">Ciente</button>
                  </div>
                </div>
              </template>
              <p class="dropdown-title">Chamados do chão de fábrica</p>
              <p v-if="!openAlerts.length" class="empty-note">Nenhum chamado aberto</p>
              <div v-for="alert in openAlerts" :key="alert.id" class="alert-item">
                <div><strong>{{ alert.message }}</strong><small>{{ store.resourceName(alert.resourceId) }} · {{ alert.operator }} · {{ fmtTime(alert.at) }}</small></div>
                <button class="button small" @click="store.resolveAlert(alert.id)">Atender</button>
              </div>
            </div>
          </div>

          <div class="menu-wrap" data-tour="help">
            <button class="icon-button" title="Guia e ajuda" @click="helpOpen = !helpOpen; bellOpen = false; areaOpen = false"><CircleHelp :size="18" /></button>
            <div v-if="helpOpen" class="dropdown menu-dropdown">
              <button @click="pageTour"><Compass :size="15" /> Guia desta tela</button>
              <button @click="welcomeTour"><BookOpen :size="15" /> Tour geral do sistema</button>
              <button @click="helpOpen = false; router.push('/ajuda')"><CircleHelp :size="15" /> Central de ajuda</button>
              <button @click="restartGuides"><RotateCcw :size="15" /> Reexibir guias de todas as telas</button>
            </div>
          </div>

          <button v-if="!store.isPlatformMaster()" class="button ghost small" @click="openPlatform">Plataforma</button>
          <div class="user-chip"><span>{{ ui.userName.split(' ').map(part => part[0]).join('').slice(0, 2) }}</span><div><strong>{{ ui.userName }}</strong><small>{{ store.isPlatformMaster() ? 'Usuário mestre' : ui.role }}</small></div></div>
        </div>
      </header>
      <nav v-if="!isHome && navigation.length" class="module-bar" aria-label="Módulos da área">
        <div class="module-tabs">
          <template v-for="(group, index) in navigation" :key="group.label">
            <span v-if="index" class="module-sep" :title="group.label"></span>
            <RouterLink v-for="item in group.items" :key="item.to" :to="item.to" class="module-tab" :class="{ 'router-link-active': owns(item.to, route.path) }" :data-tour="item.tour">
              <component :is="item.icon" :size="15" />
              <span>{{ item.label }}</span>
            </RouterLink>
          </template>
        </div>
        <RouterLink to="/integracao" class="sync-pulse" :class="{ warn: syncErrors }" data-tour="omie-status" :title="syncErrors ? `${syncErrors} falha(s) para revisar` : `Última troca: ${lastSync ? fmtTime(lastSync) : '—'}`">
          <i></i><span>Omie {{ syncErrors ? `· ${syncErrors} falha(s)` : 'conectado' }}</span>
        </RouterLink>
      </nav>
      <div class="page-content" @click="helpOpen = false; bellOpen = false; areaOpen = false"><RouterView /></div>
    </main>
  </div>

  <OrderDrawer />
  <OpDrawer />
  <RecordDrawer />
  <ToastHost v-if="!isTablet" />
  <TourGuide />
</template>

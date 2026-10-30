import { createRouter, createWebHistory } from 'vue-router'
import { AREAS, areaDestination, moduleFeature, moduleOf, screenLabel } from '../navigation'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: () => import('../views/HomeView.vue'), meta: { title: 'Início', eyebrow: 'Thalamus' } },
    { path: '/area/:id', component: () => import('../views/AreaHubView.vue'), meta: { title: 'Área', eyebrow: 'Thalamus' } },
    { path: '/painel', component: () => import('../views/DashboardView.vue'), meta: { title: 'Painel da operação', eyebrow: 'Operações' } },
    { path: '/fluxo', component: () => import('../views/FlowView.vue'), meta: { title: 'Fluxo do pedido', eyebrow: 'Do Omie à nota fiscal' } },
    { path: '/tarefas', component: () => import('../views/TasksView.vue'), meta: { title: 'Minhas tarefas', eyebrow: 'Fila de trabalho' } },
    { path: '/pedidos', component: () => import('../views/OrdersView.vue'), meta: { title: 'Vendas', eyebrow: 'Comercial' } },
    {
      path: '/crm',
      component: () => import('../views/crm/CrmLayout.vue'),
      children: [
        { path: '', component: () => import('../views/crm/CrmDashboardView.vue'), meta: { title: 'CRM', eyebrow: 'Comercial' } },
        { path: 'oportunidades', component: () => import('../views/crm/OpportunityListView.vue'), meta: { title: 'Oportunidades', eyebrow: 'Comercial' } },
        { path: 'funil', component: () => import('../views/crm/CrmPipelineView.vue'), meta: { title: 'Funil', eyebrow: 'Comercial' } },
        { path: 'propostas', component: () => import('../views/crm/ProposalListView.vue'), meta: { title: 'Propostas', eyebrow: 'Comercial' } },
        { path: 'agenda', component: () => import('../views/crm/CrmAgendaView.vue'), meta: { title: 'Agenda comercial', eyebrow: 'Comercial' } },
        { path: 'oportunidade/:id', component: () => import('../views/crm/OpportunityPage.vue'), meta: { title: 'Oportunidade', eyebrow: 'Comercial' } },
      ],
    },
    {
      path: '/produtos',
      component: () => import('../views/products/ProductsLayout.vue'),
      children: [
        { path: '', component: () => import('../views/products/ProductListView.vue'), meta: { title: 'Portfólio', eyebrow: 'Cadastros' } },
        { path: 'item/:id', component: () => import('../views/products/ProductItemView.vue'), meta: { title: 'Produto', eyebrow: 'Cadastros' } },
        { path: 'classificacao', component: () => import('../views/products/ProductClassesView.vue'), meta: { title: 'Classificação', eyebrow: 'Cadastros' } },
        { path: 'acoes', component: () => import('../views/products/ProductActionsView.vue'), meta: { title: 'Ações', eyebrow: 'Cadastros' } },
        { path: 'homologacao', redirect: '/produtos/acoes' },
        { path: 'estruturas', redirect: '/produtos/acoes' },
        { path: 'mudancas', redirect: '/produtos/acoes' },
        { path: 'fiscal', redirect: '/produtos/acoes' },
        { path: 'estoque', component: () => import('../views/products/ProductStockView.vue'), meta: { title: 'Estoque, unidades e lotes', eyebrow: 'Cadastros' } },
        { path: 'ferramental', component: () => import('../views/products/ProductToolingView.vue'), meta: { title: 'Ferramental', eyebrow: 'Cadastros' } },
      ],
    },
    {
      path: '/pessoas',
      component: () => import('../views/people/PeopleLayout.vue'),
      meta: { title: 'Pessoas', eyebrow: 'Cadastros' },
      children: [
        { path: '', component: () => import('../views/people/PeopleListView.vue'), meta: { title: 'Colaboradores', eyebrow: 'Cadastros' } },
        { path: 'nova', component: () => import('../views/people/PersonPage.vue'), meta: { title: 'Nova pessoa', eyebrow: 'Cadastros' } },
        { path: 'pessoa/:id', component: () => import('../views/people/PersonPage.vue'), meta: { title: 'Pessoa', eyebrow: 'Cadastros' } },
        { path: 'admissao', component: () => import('../views/people/AdmissionListView.vue'), meta: { title: 'Admissão', eyebrow: 'Cadastros' } },
        { path: 'admissao/nova', component: () => import('../views/people/JobPage.vue'), meta: { title: 'Nova vaga', eyebrow: 'Cadastros' } },
        { path: 'admissao/:jobId/candidatura/:id', component: () => import('../views/people/ApplicationPage.vue'), meta: { title: 'Candidatura', eyebrow: 'Cadastros' } },
        { path: 'admissao/:id', component: () => import('../views/people/JobPage.vue'), meta: { title: 'Vaga', eyebrow: 'Cadastros' } },
        { path: 'desligamento', component: () => import('../views/people/OffboardingListView.vue'), meta: { title: 'Desligamento', eyebrow: 'Cadastros' } },
        { path: 'desligamento/novo', component: () => import('../views/people/OffboardingPage.vue'), meta: { title: 'Novo desligamento', eyebrow: 'Cadastros' } },
        { path: 'desligamento/:id', component: () => import('../views/people/OffboardingPage.vue'), meta: { title: 'Desligamento', eyebrow: 'Cadastros' } },
        { path: 'organograma', component: () => import('../views/people/StructureView.vue'), meta: { title: 'Organograma', eyebrow: 'Cadastros' } },
        { path: 'estrutura', redirect: '/pessoas/organograma' },
        { path: 'cargos', component: () => import('../views/people/JobsCatalogView.vue'), meta: { title: 'Cargos', eyebrow: 'Cadastros' } },
      ],
    },
    { path: '/parceiros/:id?', component: () => import('../views/PartnersView.vue'), meta: { title: 'Parceiros', eyebrow: 'Cadastros' } },
    { path: '/servicos/:id?', component: () => import('../views/ServicesCatalogView.vue'), meta: { title: 'Serviços', eyebrow: 'Cadastros' } },
    { path: '/postos/:id?', component: () => import('../views/PostsView.vue'), meta: { title: 'Postos', eyebrow: 'Cadastros' } },
    { path: '/ativos', component: () => import('../views/AssetsView.vue'), meta: { title: 'Ativos', eyebrow: 'Cadastros' } },
    { path: '/programacao', component: () => import('../views/ScheduleView.vue'), meta: { title: 'Planejamento e programação', eyebrow: 'Operações' } },
    { path: '/ordens', component: () => import('../views/ProductionOrdersView.vue'), meta: { title: 'Ordens de produção', eyebrow: 'Planejamento' } },
    { path: '/necessidades', component: () => import('../views/MrpView.vue'), meta: { title: 'Necessidades de materiais', eyebrow: 'Planejamento' } },
    { path: '/compras', component: () => import('../views/PurchasingView.vue'), meta: { title: 'Compras', eyebrow: 'Suprimentos' } },
    { path: '/estoque', component: () => import('../views/InventoryView.vue'), meta: { title: 'Almoxarifado', eyebrow: 'Suprimentos' } },
    { path: '/demandas', component: () => import('../views/DemandsView.vue'), meta: { title: 'Demandas', eyebrow: 'Suprimentos' } },
    { path: '/injecao', component: () => import('../views/InjectionView.vue'), meta: { title: 'Injeção', eyebrow: 'Fábrica' } },
    { path: '/montagem', component: () => import('../views/AssemblyView.vue'), meta: { title: 'Montagem', eyebrow: 'Fábrica' } },
    { path: '/tablet', component: () => import('../views/TabletView.vue'), meta: { title: 'Tablet do chão de fábrica', eyebrow: 'Fábrica', layout: 'tablet' } },
    { path: '/qualidade', component: () => import('../views/QualityView.vue'), meta: { title: 'Qualidade', eyebrow: 'Operações' } },
    { path: '/expedicao', component: () => import('../views/ShippingView.vue'), meta: { title: 'Expedição', eyebrow: 'Comercial' } },
    { path: '/manutencao', component: () => import('../views/MaintenanceView.vue'), meta: { title: 'Manutenção', eyebrow: 'Serviços' } },
    { path: '/assistencia', component: () => import('../views/TechnicalServiceView.vue'), meta: { title: 'Assistência técnica', eyebrow: 'Serviços' } },
    { path: '/indicadores', component: () => import('../views/IndicatorsView.vue'), meta: { title: 'Indicadores', eyebrow: 'Gestão' } },
    { path: '/projetos', component: () => import('../views/ProjectsView.vue'), meta: { title: 'Projetos', eyebrow: 'Gestão' } },
    { path: '/organizacao', component: () => import('../views/OrganizationView.vue'), meta: { title: 'Gestão de acesso', eyebrow: 'Cadastros' } },
    { path: '/plataforma', component: () => import('../views/PlatformView.vue'), meta: { title: 'Plataforma', eyebrow: 'Empresas e grupos' } },
    { path: '/integracao', component: () => import('../views/IntegrationView.vue'), meta: { title: 'Integração Omie', eyebrow: 'Gestão' } },
    { path: '/ajuda', component: () => import('../views/HelpView.vue'), meta: { title: 'Central de ajuda', eyebrow: 'Como funciona' } },
    { path: '/ajuda/manual/:id?', component: () => import('../views/help/ManualView.vue'), meta: { title: 'Manual do sistema', eyebrow: 'Central de ajuda' } },
    { path: '/dre', component: () => import('../views/DreView.vue'), meta: { title: 'DRE', eyebrow: 'Finanças' } },
    { path: '/orcamentos', component: () => import('../views/BudgetsView.vue'), meta: { title: 'Orçamentos', eyebrow: 'Finanças' } },
    { path: '/centros-de-custo', redirect: '/orcamentos' },
    { path: '/leitura-financeira', redirect: '/dre' },
    { path: '/contas-pagar', component: () => import('../views/FinanceTitlesView.vue'), meta: { title: 'Contas a pagar', eyebrow: 'Finanças' } },
    { path: '/contas-receber', component: () => import('../views/FinanceTitlesView.vue'), meta: { title: 'Contas a receber', eyebrow: 'Finanças' } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

function applyDocumentTitle(path: string, metaTitle: unknown) {
  const itemId = path.match(/^\/produtos\/item\/([^/]+)/)?.[1]
  const opportunityId = path.match(/^\/crm\/oportunidade\/([^/]+)/)?.[1]
  const code = itemId ? useErpStore().state.items.find(entry => entry.id === decodeURIComponent(itemId))?.code : opportunityId ? decodeURIComponent(opportunityId) : undefined
  const label = code ?? screenLabel(path, typeof metaTitle === 'string' ? metaTitle : undefined)
  document.title = label ? `Thalamus | ${label}` : 'Thalamus'
}

router.afterEach((to, from) => {
  applyDocumentTitle(to.path, to.meta.title)
  if (to.path !== from.path) useUiStore().closeRecord()
})

router.beforeEach(to => {
  const store = useErpStore()
  const ui = useUiStore()
  if (store.isPlatformMaster()) return to.path === '/plataforma' || to.path.startsWith('/ajuda') ? true : '/plataforma'
  const hubId = to.path.match(/^\/area\/([^/]+)/)?.[1]
  if (hubId) {
    const area = AREAS.find(entry => entry.id === hubId)
    const destination = area ? areaDestination(area, module => !module || store.can(moduleFeature(module))) : undefined
    if (!area || !destination) return '/'
    if (destination !== to.path) return destination
    to.meta.title = area.label
    to.meta.eyebrow = 'Thalamus'
    return true
  }
  if (to.path === '/plataforma') {
    ui.notify('error', 'Acesso não permitido', 'A plataforma é do usuário mestre')
    return '/'
  }
  const module = moduleOf(to.path)
  if (!module) return true
  if (store.can(moduleFeature(module))) return true
  ui.notify('error', 'Acesso não permitido', `O perfil visualizado não tem acesso ao módulo ${module}`)
  return to.path === '/tarefas' ? true : '/tarefas'
})

import { createRouter, createWebHistory } from 'vue-router'
import { moduleFeature, moduleOf } from '../navigation'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: () => import('../views/HomeView.vue'), meta: { title: 'Início', eyebrow: 'Thalamus' } },
    { path: '/painel', component: () => import('../views/DashboardView.vue'), meta: { title: 'Painel da operação', eyebrow: 'Operações' } },
    { path: '/fluxo', component: () => import('../views/FlowView.vue'), meta: { title: 'Fluxo do pedido', eyebrow: 'Do Omie à nota fiscal' } },
    { path: '/tarefas', component: () => import('../views/TasksView.vue'), meta: { title: 'Minhas tarefas', eyebrow: 'Fila de trabalho' } },
    { path: '/pedidos', component: () => import('../views/OrdersView.vue'), meta: { title: 'Vendas', eyebrow: 'Comercial' } },
    { path: '/crm', component: () => import('../views/CrmView.vue'), meta: { title: 'CRM e propostas', eyebrow: 'Comercial' } },
    {
      path: '/produtos',
      component: () => import('../views/products/ProductsLayout.vue'),
      children: [
        { path: '', component: () => import('../views/products/ProductListView.vue'), meta: { title: 'Produtos e itens', eyebrow: 'Cadastros' } },
        { path: 'item/:id', component: () => import('../views/products/ProductItemView.vue'), meta: { title: 'Item', eyebrow: 'Cadastros' } },
        { path: 'homologacao', component: () => import('../views/products/ProductQueuesView.vue'), meta: { title: 'Homologação e pendências', eyebrow: 'Cadastros' } },
        { path: 'classificacao', component: () => import('../views/products/ProductClassesView.vue'), meta: { title: 'Classificação', eyebrow: 'Cadastros' } },
        { path: 'estruturas', component: () => import('../views/products/ProductStructuresView.vue'), meta: { title: 'Estruturas e versões', eyebrow: 'Cadastros' } },
        { path: 'estoque', component: () => import('../views/products/ProductStockView.vue'), meta: { title: 'Estoque, unidades e lotes', eyebrow: 'Cadastros' } },
        { path: 'mudancas', component: () => import('../views/products/ProductChangesView.vue'), meta: { title: 'Mudanças de engenharia', eyebrow: 'Cadastros' } },
        { path: 'ferramental', component: () => import('../views/products/ProductToolingView.vue'), meta: { title: 'Ferramental', eyebrow: 'Cadastros' } },
        { path: 'fiscal', component: () => import('../views/products/ProductFiscalView.vue'), meta: { title: 'Fiscal do item', eyebrow: 'Cadastros' } },
      ],
    },
    { path: '/pessoas', component: () => import('../views/PeopleView.vue'), meta: { title: 'Pessoas e organograma', eyebrow: 'Cadastros' } },
    { path: '/parceiros/:id?', component: () => import('../views/PartnersView.vue'), meta: { title: 'Parceiros', eyebrow: 'Cadastros' } },
    { path: '/servicos', component: () => import('../views/ServicesCatalogView.vue'), meta: { title: 'Catálogo de serviços', eyebrow: 'Cadastros' } },
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
    { path: '/organizacao', component: () => import('../views/OrganizationView.vue'), meta: { title: 'Organização e acessos', eyebrow: 'Gestão' } },
    { path: '/plataforma', component: () => import('../views/PlatformView.vue'), meta: { title: 'Plataforma', eyebrow: 'Empresas e grupos' } },
    { path: '/integracao', component: () => import('../views/IntegrationView.vue'), meta: { title: 'Integração Omie', eyebrow: 'Gestão' } },
    { path: '/ajuda', component: () => import('../views/HelpView.vue'), meta: { title: 'Central de ajuda', eyebrow: 'Como funciona' } },
    { path: '/ajuda/manual/:id?', component: () => import('../views/help/ManualView.vue'), meta: { title: 'Manual do sistema', eyebrow: 'Central de ajuda' } },
    { path: '/dre', component: () => import('../views/DreView.vue'), meta: { title: 'DRE', eyebrow: 'Finanças' } },
    { path: '/orcamentos', component: () => import('../views/BudgetsView.vue'), meta: { title: 'Orçamentos', eyebrow: 'Finanças' } },
    { path: '/centros-de-custo', redirect: () => { useUiStore().budgetTab = 'centros'; return '/orcamentos' } },
    { path: '/leitura-financeira', redirect: '/dre' },
    { path: '/contas-pagar', component: () => import('../views/FinanceTitlesView.vue'), meta: { title: 'Contas a pagar', eyebrow: 'Finanças' } },
    { path: '/contas-receber', component: () => import('../views/FinanceTitlesView.vue'), meta: { title: 'Contas a receber', eyebrow: 'Finanças' } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.afterEach((to, from) => {
  if (to.path !== from.path) useUiStore().closeRecord()
})

router.beforeEach(to => {
  const store = useErpStore()
  const ui = useUiStore()
  if (store.isPlatformMaster()) return to.path === '/plataforma' || to.path.startsWith('/ajuda') ? true : '/plataforma'
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

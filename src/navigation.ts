import type { Component } from 'vue'
export { moduleFeature } from './domain/access'
import {
  BadgeDollarSign, BarChart3, Boxes, BriefcaseBusiness, Building2, CalendarRange, CircleDollarSign,
  ClipboardCheck, Factory, FolderKanban, Gauge, HandCoins, Headset, LifeBuoy, ListChecks, PackageCheck,
  PackageSearch, ReceiptText, ShoppingCart, Tablet, Truck, Unplug, UserRoundCog, Users, Warehouse, Workflow, Wrench,
} from 'lucide-vue-next'

export interface NavItem {
  label: string
  to: string
  icon: Component
  module?: string
  tour?: string
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export interface Area {
  id: string
  label: string
  description: string
  icon: Component
  groups: NavGroup[]
}

/** Áreas do sistema; fonte única para menus, permissões e seletor de área. */
export const AREAS: Area[] = [
  {
    id: 'cadastros', label: 'Cadastros', description: 'Produtos, pessoas, serviços e patrimônio em uma fonte única.', icon: Building2,
    groups: [
      { label: 'Engenharia', items: [{ label: 'Produtos', to: '/produtos', icon: Boxes, module: 'Produtos' }, { label: 'Serviços', to: '/servicos', icon: BriefcaseBusiness, module: 'Serviços' }] },
      { label: 'Organização', items: [{ label: 'Pessoas', to: '/pessoas', icon: Users, module: 'Pessoas' }, { label: 'Ativos', to: '/ativos', icon: Factory, module: 'Ativos' }] },
    ],
  },
  {
    id: 'suprimentos', label: 'Suprimentos', description: 'Da necessidade ao recebimento, reserva e separação.', icon: Warehouse,
    groups: [{ label: 'Abastecimento', items: [
      { label: 'Compras', to: '/compras', icon: ShoppingCart, module: 'Compras' },
      { label: 'Almoxarifado', to: '/estoque', icon: Warehouse, module: 'Almoxarifado' },
      { label: 'Demandas', to: '/demandas', icon: ListChecks, module: 'Demandas' },
    ] }],
  },
  {
    id: 'comercial', label: 'Comercial', description: 'Do relacionamento à proposta, venda e entrega.', icon: HandCoins,
    groups: [
      { label: 'Relacionamento', items: [{ label: 'CRM', to: '/crm', icon: Users, module: 'CRM' }, { label: 'Vendas', to: '/pedidos', icon: ShoppingCart, module: 'Vendas' }] },
      { label: 'Entrega', items: [{ label: 'Expedição', to: '/expedicao', icon: Truck, module: 'Expedição' }] },
    ],
  },
  {
    id: 'operacoes', label: 'Operações', description: 'Planejar, produzir, inspecionar e apontar no tablet.', icon: Factory,
    groups: [
      { label: 'Acompanhamento', items: [
        { label: 'Painel da operação', to: '/painel', icon: Gauge, module: 'Painel' },
        { label: 'Fluxo do pedido', to: '/fluxo', icon: Workflow, module: 'Fluxo do pedido', tour: 'nav-fluxo' },
        { label: 'Minhas tarefas', to: '/tarefas', icon: ListChecks, tour: 'nav-tarefas' },
      ] },
      { label: 'Planejamento', items: [
        { label: 'Planejamento', to: '/programacao', icon: CalendarRange, module: 'Planejamento' },
        { label: 'Ordens de produção', to: '/ordens', icon: ClipboardCheck, module: 'Ordens de produção' },
        { label: 'Necessidades', to: '/necessidades', icon: PackageSearch, module: 'Demandas' },
      ] },
      { label: 'Execução', items: [
        { label: 'Injeção', to: '/injecao', icon: Factory, module: 'Injeção' },
        { label: 'Montagem', to: '/montagem', icon: Boxes, module: 'Montagem' },
        { label: 'Qualidade', to: '/qualidade', icon: PackageCheck, module: 'Qualidade' },
        { label: 'Tablet', to: '/tablet', icon: Tablet, tour: 'nav-tablet' },
      ] },
    ],
  },
  {
    id: 'servicos', label: 'Serviços', description: 'Disponibilidade da fábrica e atendimento após a entrega.', icon: Wrench,
    groups: [{ label: 'Ordens de serviço', items: [
      { label: 'Manutenção', to: '/manutencao', icon: Wrench, module: 'Manutenção' },
      { label: 'Assistência técnica', to: '/assistencia', icon: Headset, module: 'Assistência Técnica' },
    ] }],
  },
  {
    id: 'gestao', label: 'Gestão', description: 'Indicadores, projetos, integração e governança.', icon: BarChart3,
    groups: [
      { label: 'Gestão', items: [{ label: 'Indicadores', to: '/indicadores', icon: BarChart3, module: 'Indicadores' }, { label: 'Projetos', to: '/projetos', icon: FolderKanban, module: 'Projetos' }] },
      { label: 'Sistema', items: [{ label: 'Organização e acessos', to: '/organizacao', icon: UserRoundCog, module: 'Organização' }, { label: 'Integração Omie', to: '/integracao', icon: Unplug, module: 'Integração Omie' }, { label: 'Central de ajuda', to: '/ajuda', icon: LifeBuoy }] },
    ],
  },
  {
    id: 'financas', label: 'Finanças', description: 'Orçamento e compromissos operacionais, sem duplicar o Omie.', icon: CircleDollarSign,
    groups: [
      { label: 'Planejamento', items: [{ label: 'Orçamentos', to: '/orcamentos', icon: BadgeDollarSign, module: 'Orçamentos' }] },
      { label: 'Títulos', items: [{ label: 'Contas a pagar', to: '/contas-pagar', icon: ReceiptText, module: 'Contas a pagar' }, { label: 'Contas a receber', to: '/contas-receber', icon: CircleDollarSign, module: 'Contas a receber' }] },
    ],
  },
]

export const NAVIGATION: NavGroup[] = AREAS.flatMap(area => area.groups)

export const ROUTE_MODULE: Record<string, string | undefined> = Object.fromEntries(
  NAVIGATION.flatMap(group => group.items).map(item => [item.to, item.module]),
)

export const owns = (to: string, path: string) => path === to || path.startsWith(`${to}/`)

export const areaOf = (path: string) => AREAS.find(area => area.groups.some(group => group.items.some(item => owns(item.to, path))))

export const moduleOf = (path: string) => NAVIGATION.flatMap(group => group.items).find(item => owns(item.to, path))?.module

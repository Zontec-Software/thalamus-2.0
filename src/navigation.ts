import type { Component } from 'vue'
export { moduleFeature } from './domain/access'
import {
  ArrowDownToLine, ArrowUpFromLine, BadgeDollarSign, BarChart3, Boxes, BriefcaseBusiness, Building2, CalendarRange, CircleDollarSign, Handshake, Landmark,
  ClipboardCheck, Cog, Factory, FolderKanban, Gauge, HandCoins, Headset, LifeBuoy, ListChecks, PackageCheck,
  PackageSearch, ShoppingCart, Tablet, Truck, Unplug, UserRoundCog, Users, Warehouse, Workflow, Wrench,
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
    id: 'cadastros', label: 'Cadastros', description: 'Produtos, pessoas, postos, serviços e patrimônio em uma fonte única.', icon: Building2,
    groups: [
      { label: 'Engenharia', items: [{ label: 'Produtos', to: '/produtos', icon: Boxes, module: 'Produtos' }, { label: 'Serviços', to: '/servicos', icon: BriefcaseBusiness, module: 'Serviços' }] },
      { label: 'Organização', items: [{ label: 'Pessoas', to: '/pessoas', icon: Users, module: 'Pessoas' }, { label: 'Parceiros', to: '/parceiros', icon: Handshake, module: 'Parceiros' }, { label: 'Postos', to: '/postos', icon: Cog, module: 'Postos' }, { label: 'Ativos', to: '/ativos', icon: Factory, module: 'Ativos' }, { label: 'Gestão de acesso', to: '/organizacao', icon: UserRoundCog, module: 'Organização' }] },
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
      { label: 'Sistema', items: [{ label: 'Integração Omie', to: '/integracao', icon: Unplug, module: 'Integração Omie' }, { label: 'Central de ajuda', to: '/ajuda', icon: LifeBuoy }] },
    ],
  },
  {
    id: 'financas', label: 'Finanças', description: 'Resultado, orçamento e centros de custo. Banco e contabilidade ficam no Omie.', icon: CircleDollarSign,
    groups: [
      { label: 'Planejamento', items: [
        { label: 'DRE', to: '/dre', icon: Landmark, module: 'DRE' },
        { label: 'Orçamentos', to: '/orcamentos', icon: BadgeDollarSign, module: 'Orçamentos' },
      ] },
      { label: 'Títulos (em estruturação)', items: [
        { label: 'Contas a pagar', to: '/contas-pagar', icon: ArrowUpFromLine, module: 'Orçamentos' },
        { label: 'Contas a receber', to: '/contas-receber', icon: ArrowDownToLine, module: 'Orçamentos' },
      ] },
    ],
  },
]

export const NAVIGATION: NavGroup[] = AREAS.flatMap(area => area.groups)

export const ROUTE_MODULE: Record<string, string | undefined> = Object.fromEntries(
  NAVIGATION.flatMap(group => group.items).map(item => [item.to, item.module]),
)

export const owns = (to: string, path: string) => path === to || path.startsWith(`${to}/`)

export const areaHubPath = (areaId: string) => `/area/${areaId}`

/** Módulos da área que o perfil pode abrir. Item sem módulo fica visível para todos. */
export function areaItems(area: Area, can: (module?: string) => boolean) {
  return area.groups.flatMap(group => group.items).filter(item => can(item.module))
}

/**
 * Destino do clique na área. Um único módulo abre direto.
 * Dois ou mais abrem o mapa da área.
 */
export function areaDestination(area: Area, can: (module?: string) => boolean): string | undefined {
  const items = areaItems(area, can)
  if (items.length === 1) return items[0].to
  if (items.length > 1) return areaHubPath(area.id)
  return undefined
}

export const areaOf = (path: string) => {
  const hub = path.match(/^\/area\/([^/]+)/)?.[1]
  if (hub) return AREAS.find(area => area.id === hub)
  return AREAS.find(area => area.groups.some(group => group.items.some(item => owns(item.to, path))))
}

export const moduleOf = (path: string) => NAVIGATION.flatMap(group => group.items).find(item => owns(item.to, path))?.module

/** Rótulo curto da tela ativa, para a guia do navegador. Na raiz do módulo usa o nome da barra. */
export function screenLabel(path: string, metaTitle?: string): string | undefined {
  if (path === '/' || path === '') return undefined
  const nav = NAVIGATION.flatMap(group => group.items)
    .filter(entry => owns(entry.to, path))
    .sort((a, b) => b.to.length - a.to.length)[0]
  if (nav && (path === nav.to || path === `${nav.to}/`)) return nav.label
  return metaTitle || nav?.label
}

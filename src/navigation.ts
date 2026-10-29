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
  /** Uma linha no mapa da área: o que a pessoa encontra ao abrir. */
  hint: string
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
      { label: 'Engenharia', items: [
        { label: 'Produtos', to: '/produtos', icon: Boxes, module: 'Produtos', hint: 'Catálogo, estrutura, fiscal e revisões' },
        { label: 'Serviços', to: '/servicos', icon: BriefcaseBusiness, module: 'Serviços', hint: 'O que a empresa presta e cobra' },
      ] },
      { label: 'Organização', items: [
        { label: 'Pessoas', to: '/pessoas', icon: Users, module: 'Pessoas', hint: 'Colaboradores, cargos e desligamento' },
        { label: 'Parceiros', to: '/parceiros', icon: Handshake, module: 'Parceiros', hint: 'Clientes e fornecedores' },
        { label: 'Postos', to: '/postos', icon: Cog, module: 'Postos', hint: 'Máquinas, células e capacidade' },
        { label: 'Ativos', to: '/ativos', icon: Factory, module: 'Ativos', hint: 'Patrimônio acompanhado pela manutenção' },
        { label: 'Gestão de acesso', to: '/organizacao', icon: UserRoundCog, module: 'Organização', hint: 'Perfis e o que cada um pode fazer' },
      ] },
    ],
  },
  {
    id: 'suprimentos', label: 'Suprimentos', description: 'Da necessidade ao recebimento, reserva e separação.', icon: Warehouse,
    groups: [{ label: 'Abastecimento', items: [
      { label: 'Compras', to: '/compras', icon: ShoppingCart, module: 'Compras', hint: 'Da cotação ao recebimento' },
      { label: 'Almoxarifado', to: '/estoque', icon: Warehouse, module: 'Almoxarifado', hint: 'Saldo, reserva e separação' },
      { label: 'Demandas', to: '/demandas', icon: ListChecks, module: 'Demandas', hint: 'O que falta comprar ou fabricar' },
    ] }],
  },
  {
    id: 'comercial', label: 'Comercial', description: 'Do relacionamento à proposta, venda e entrega.', icon: HandCoins,
    groups: [
      { label: 'Relacionamento', items: [
        { label: 'CRM', to: '/crm', icon: Users, module: 'CRM', hint: 'Oportunidades e propostas' },
        { label: 'Vendas', to: '/pedidos', icon: ShoppingCart, module: 'Vendas', hint: 'Pedidos aprovados no Omie' },
      ] },
      { label: 'Entrega', items: [{ label: 'Expedição', to: '/expedicao', icon: Truck, module: 'Expedição', hint: 'Conferência e carga' }] },
    ],
  },
  {
    id: 'operacoes', label: 'Operações', description: 'Planejar, produzir, inspecionar e apontar no tablet.', icon: Factory,
    groups: [
      { label: 'Acompanhamento', items: [
        { label: 'Painel da operação', to: '/painel', icon: Gauge, module: 'Painel', hint: 'A fábrica neste momento' },
        { label: 'Fluxo do pedido', to: '/fluxo', icon: Workflow, module: 'Fluxo do pedido', tour: 'nav-fluxo', hint: 'Do pedido à nota fiscal' },
        { label: 'Minhas tarefas', to: '/tarefas', icon: ListChecks, tour: 'nav-tarefas', hint: 'O que depende de você' },
      ] },
      { label: 'Planejamento', items: [
        { label: 'Planejamento', to: '/programacao', icon: CalendarRange, module: 'Planejamento', hint: 'Capacidade e programação' },
        { label: 'Ordens de produção', to: '/ordens', icon: ClipboardCheck, module: 'Ordens de produção', hint: 'O que vai ser fabricado' },
        { label: 'Necessidades', to: '/necessidades', icon: PackageSearch, module: 'Demandas', hint: 'Material que a produção pede' },
      ] },
      { label: 'Execução', items: [
        { label: 'Injeção', to: '/injecao', icon: Factory, module: 'Injeção', hint: 'Peças nas injetoras' },
        { label: 'Montagem', to: '/montagem', icon: Boxes, module: 'Montagem', hint: 'Células de montagem' },
        { label: 'Qualidade', to: '/qualidade', icon: PackageCheck, module: 'Qualidade', hint: 'Inspeção e liberação' },
        { label: 'Tablet', to: '/tablet', icon: Tablet, tour: 'nav-tablet', hint: 'Apontamento no chão de fábrica' },
      ] },
    ],
  },
  {
    id: 'servicos', label: 'Serviços', description: 'Disponibilidade da fábrica e atendimento após a entrega.', icon: Wrench,
    groups: [{ label: 'Ordens de serviço', items: [
      { label: 'Manutenção', to: '/manutencao', icon: Wrench, module: 'Manutenção', hint: 'Disponibilidade das máquinas' },
      { label: 'Assistência técnica', to: '/assistencia', icon: Headset, module: 'Assistência Técnica', hint: 'Atendimento depois da entrega' },
    ] }],
  },
  {
    id: 'gestao', label: 'Gestão', description: 'Indicadores, projetos, integração e governança.', icon: BarChart3,
    groups: [
      { label: 'Gestão', items: [
        { label: 'Indicadores', to: '/indicadores', icon: BarChart3, module: 'Indicadores', hint: 'Números da operação' },
        { label: 'Projetos', to: '/projetos', icon: FolderKanban, module: 'Projetos', hint: 'Iniciativas e prazos' },
      ] },
      { label: 'Sistema', items: [
        { label: 'Integração Omie', to: '/integracao', icon: Unplug, module: 'Integração Omie', hint: 'O que entrou e o que falhou' },
        { label: 'Central de ajuda', to: '/ajuda', icon: LifeBuoy, hint: 'Manual e guias de cada tela' },
      ] },
    ],
  },
  {
    id: 'financas', label: 'Finanças', description: 'Resultado e orçamento por setor utilizador. Banco e contabilidade ficam no Omie.', icon: CircleDollarSign,
    groups: [
      { label: 'Planejamento', items: [
        { label: 'DRE', to: '/dre', icon: Landmark, module: 'DRE', hint: 'Resultado por setor utilizador' },
        { label: 'Orçamentos', to: '/orcamentos', icon: BadgeDollarSign, module: 'Orçamentos', hint: 'Teto e o que já foi consumido' },
      ] },
      { label: 'Títulos (em estruturação)', items: [
        { label: 'Contas a pagar', to: '/contas-pagar', icon: ArrowUpFromLine, module: 'Orçamentos', hint: 'Compromissos a pagar' },
        { label: 'Contas a receber', to: '/contas-receber', icon: ArrowDownToLine, module: 'Orçamentos', hint: 'Títulos a receber' },
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

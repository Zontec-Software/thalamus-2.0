import type { Component } from 'vue'
export { moduleFeature } from './domain/access'
import {
  IconAdministracao, IconComercial, IconEngenharia, IconFabrica, IconFinancas, IconGestao, IconOperacoes,
  IconPatrimonio, IconPedido, IconPessoas, IconServicos, IconSuprimentos, IconTablet,
} from './icons/ds'
import {
  ArrowDownToLine, ArrowUpFromLine, Boxes, BriefcaseBusiness, CalendarRange, ClipboardCheck, Cog, FileText,
  FolderKanban, Gauge, GraduationCap, Handshake, Headset, Landmark, ListChecks, PackageCheck, PackageSearch, Shield,
  ShoppingCart, Truck, Unplug, Users, Warehouse, Workflow,
} from 'lucide-vue-next'

export interface NavItem {
  label: string
  /** Ausente quando o atalho já está no mapa, mas a tela ainda não existe. */
  to?: string
  icon: Component
  /** Uma linha no mapa da área: o que a pessoa encontra ao abrir. */
  hint: string
  module?: string
  tour?: string
  /** Previsto na proposta. Aparece no cartão, sem navegação. */
  pending?: boolean
  /** Atalho do cartão na home. */
  home?: boolean
  /** Fora da barra de módulos. O atalho da home continua. */
  bar?: boolean
  /** Consulta que distingue duas portas da mesma tela. */
  query?: Record<string, string>
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
  /** Faixa da home. */
  band: 'cadeia' | 'apoio'
  groups: NavGroup[]
}

const soon = (label: string, icon: NavItem['icon'], hint: string): NavItem => ({ label, icon, hint, pending: true, home: true })

/** Módulos do sistema; fonte única para a home, os menus e o seletor de área. */
export const AREAS: Area[] = [
  {
    id: 'comercial', band: 'cadeia', label: 'Comercial', description: 'Do primeiro contato ao pedido fechado.', icon: IconComercial,
    groups: [
      { label: 'Relacionamento', items: [
        { label: 'Clientes', to: '/parceiros', query: { origem: 'comercial' }, icon: Handshake, module: 'Parceiros', home: true, hint: 'Quem compra da empresa. O cadastro é o mesmo dos fornecedores.' },
        { label: 'CRM', to: '/crm', icon: Users, module: 'CRM', home: true, hint: 'Painel e oportunidades' },
        { label: 'Propostas', to: '/crm/propostas', icon: IconPedido, module: 'CRM', home: true, bar: false, hint: 'Propostas enviadas ao cliente' },
      ] },
      { label: 'Venda', items: [
        { label: 'Pedidos de venda', to: '/pedidos', icon: IconPedido, module: 'Vendas', home: true, hint: 'Pedidos aprovados no Omie' },
      ] },
    ],
  },
  {
    id: 'engenharia', band: 'cadeia', label: 'Engenharia', description: 'O que fabricamos: produto, estrutura e evolução.', icon: IconEngenharia,
    groups: [
      { label: 'Produto', items: [
        { label: 'Produtos e estruturas', to: '/produtos', icon: IconEngenharia, module: 'Produtos', home: true, hint: 'Catálogo, estrutura, fiscal e revisões' },
        soon('Revisões', ClipboardCheck, 'A revisão segue dentro da ficha do produto.'),
        soon('Projetos de P&D', FolderKanban, 'Projeto de desenvolvimento de produto, separado do projeto corporativo.'),
      ] },
      { label: 'Catálogo', items: [
        { label: 'Serviços', to: '/servicos', icon: BriefcaseBusiness, module: 'Serviços', hint: 'O que a empresa presta e cobra' },
      ] },
    ],
  },
  {
    id: 'suprimentos', band: 'cadeia', label: 'Suprimentos', description: 'Da necessidade de material até o estoque.', icon: IconSuprimentos,
    groups: [{ label: 'Abastecimento', items: [
      { label: 'Fornecedores', to: '/parceiros', query: { origem: 'suprimentos' }, icon: Handshake, module: 'Parceiros', home: true, hint: 'Quem vende para a empresa. O cadastro é o mesmo dos clientes.' },
      { label: 'Requisições', to: '/demandas', icon: ListChecks, module: 'Demandas', home: true, hint: 'O que falta comprar ou fabricar' },
      { label: 'Compras', to: '/compras', icon: ShoppingCart, module: 'Compras', home: true, hint: 'Da cotação ao pedido de compra' },
      soon('Recebimento', PackageCheck, 'A conferência do que chegou ainda acontece dentro de Compras.'),
      { label: 'Almoxarifado', to: '/estoque', icon: Warehouse, module: 'Almoxarifado', home: true, hint: 'Saldo, reserva e separação' },
    ] }],
  },
  {
    id: 'operacoes', band: 'cadeia', label: 'Operações', description: 'Planejar, produzir, inspecionar e despachar.', icon: IconOperacoes,
    groups: [
      { label: 'Acompanhamento', items: [
        { label: 'Painel da operação', to: '/painel', icon: Gauge, module: 'Painel', hint: 'A fábrica neste momento' },
        { label: 'Fluxo do pedido', to: '/fluxo', icon: Workflow, module: 'Fluxo do pedido', tour: 'nav-fluxo', hint: 'Do pedido à nota fiscal' },
      ] },
      { label: 'Planejamento', items: [
        { label: 'Planejamento', to: '/programacao', icon: CalendarRange, module: 'Planejamento', home: true, hint: 'Capacidade e programação' },
        { label: 'Ordens de produção', to: '/ordens', icon: ClipboardCheck, module: 'Ordens de produção', home: true, hint: 'O que vai ser fabricado' },
        { label: 'Necessidades', to: '/necessidades', icon: PackageSearch, module: 'Demandas', hint: 'Material que a produção pede' },
      ] },
      { label: 'Chão de fábrica', items: [
        { label: 'Injeção', to: '/injecao', icon: IconFabrica, module: 'Injeção', hint: 'Peças nas injetoras' },
        { label: 'Montagem', to: '/montagem', icon: Boxes, module: 'Montagem', hint: 'Células de montagem' },
        { label: 'Apontamento', to: '/tablet', icon: IconTablet, home: true, tour: 'nav-tablet', hint: 'Apontamento no chão de fábrica' },
        { label: 'Qualidade', to: '/qualidade', icon: PackageCheck, module: 'Qualidade', home: true, hint: 'Inspeção e liberação' },
      ] },
      { label: 'Saída', items: [
        { label: 'Expedição', to: '/expedicao', icon: Truck, module: 'Expedição', home: true, hint: 'Conferência e carga' },
        { label: 'Manutenção', to: '/manutencao', icon: IconServicos, module: 'Manutenção', home: true, hint: 'Disponibilidade das máquinas' },
      ] },
    ],
  },
  {
    id: 'servicos', band: 'cadeia', label: 'Serviços e Contratos', description: 'O cliente depois da entrega: atendimento técnico, garantia e contratos de locação.', icon: IconServicos,
    groups: [{ label: 'Depois da entrega', items: [
      { label: 'Assistência técnica', to: '/assistencia', icon: Headset, module: 'Assistência Técnica', home: true, hint: 'Atendimento depois da entrega' },
      soon('Garantia', Shield, 'A garantia hoje é calculada dentro do chamado de assistência.'),
      soon('Contratos de locação', FileText, 'Contrato de locação de equipamento ainda não tem tela.'),
    ] }],
  },
  {
    id: 'pessoas', band: 'apoio', label: 'Pessoas', description: 'Quem faz a empresa funcionar.', icon: IconPessoas,
    groups: [{ label: 'Pessoas', items: [
      { label: 'Colaboradores', to: '/pessoas', icon: IconPessoas, module: 'Pessoas', home: true, hint: 'Quem trabalha na empresa' },
      { label: 'Cargos e funções', to: '/pessoas/cargos', icon: IconPessoas, module: 'Pessoas', home: true, bar: false, hint: 'O catálogo do trabalho' },
      soon('Treinamentos', GraduationCap, 'Formação e reciclagem ainda não têm tela.'),
    ] }],
  },
  {
    id: 'patrimonio', band: 'apoio', label: 'Patrimônio', description: 'Bens da empresa: da aquisição à baixa.', icon: IconPatrimonio,
    groups: [{ label: 'Bens', items: [
      { label: 'Bens e equipamentos', to: '/ativos', icon: IconPatrimonio, module: 'Ativos', home: true, hint: 'Patrimônio acompanhado pela manutenção' },
      soon('Movimentações', Truck, 'Transferência e baixa do bem ainda não têm tela.'),
      soon('Inventário', ClipboardCheck, 'Contagem patrimonial, diferente do almoxarifado.'),
      soon('Depreciação', Landmark, 'A depreciação estimada hoje aparece no DRE.'),
    ] }],
  },
  {
    id: 'financas', band: 'apoio', label: 'Finanças', description: 'Orçamento por setor e resultado. Banco e contabilidade no Omie.', icon: IconFinancas,
    groups: [
      { label: 'Resultado', items: [
        { label: 'Orçamento anual', to: '/orcamentos', icon: IconFinancas, module: 'Orçamentos', home: true, hint: 'Teto e o que já foi consumido' },
        { label: 'DRE', to: '/dre', icon: Landmark, module: 'DRE', home: true, hint: 'Resultado por setor utilizador' },
      ] },
      { label: 'Títulos', items: [
        { label: 'Contas a pagar', to: '/contas-pagar', icon: ArrowUpFromLine, module: 'Orçamentos', home: true, hint: 'Compromissos a pagar' },
        { label: 'Contas a receber', to: '/contas-receber', icon: ArrowDownToLine, module: 'Orçamentos', home: true, hint: 'Títulos a receber' },
      ] },
    ],
  },
  {
    id: 'gestao', band: 'apoio', label: 'Gestão', description: 'Acompanhar e decidir.', icon: IconGestao,
    groups: [{ label: 'Gestão', items: [
      { label: 'Indicadores', to: '/indicadores', icon: IconGestao, module: 'Indicadores', home: true, hint: 'Números da operação' },
      { label: 'Projetos corporativos', to: '/projetos', icon: FolderKanban, module: 'Projetos', home: true, hint: 'Iniciativas e prazos da empresa' },
    ] }],
  },
  {
    id: 'administracao', band: 'apoio', label: 'Administração do sistema', description: 'Configuração do Thalamus.', icon: IconAdministracao,
    groups: [{ label: 'Sistema', items: [
      { label: 'Usuários e permissões', to: '/organizacao', icon: IconAdministracao, module: 'Organização', home: true, hint: 'Perfis e o que cada um pode fazer' },
      soon('Cadastros gerais', Cog, 'Tabelas compartilhadas que ainda não têm uma tela própria.'),
      { label: 'Postos e centros de custo', to: '/postos', icon: Cog, module: 'Postos', home: true, hint: 'Máquinas, células e capacidade' },
      { label: 'Integração Omie', to: '/integracao', icon: Unplug, module: 'Integração Omie', home: true, hint: 'O que entrou e o que falhou' },
    ] }],
  },
]

export const NAVIGATION: NavGroup[] = AREAS.flatMap(area => area.groups)

export const ROUTE_MODULE: Record<string, string | undefined> = Object.fromEntries(
  NAVIGATION.flatMap(group => group.items).flatMap(item => item.to ? [[item.to, item.module]] : []),
)

export const owns = (to: string | undefined, path: string) => !!to && (path === to || path.startsWith(`${to}/`))

export function navTarget(item: NavItem) {
  if (!item.to) return '/'
  return item.query ? { path: item.to, query: item.query } : item.to
}

export const areaHubPath = (areaId: string) => `/area/${areaId}`

/** Telas que o perfil pode abrir. Atalho sem tela fica de fora. */
export function areaItems(area: Area, can: (module?: string) => boolean) {
  return area.groups.flatMap(group => group.items).filter(item => item.to && !item.pending && can(item.module))
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

export const areaOf = (path: string, origin?: string) => {
  const hub = path.match(/^\/area\/([^/]+)/)?.[1]
  if (hub) return AREAS.find(area => area.id === hub)
  const owners = AREAS.filter(area => area.groups.some(group => group.items.some(item => owns(item.to, path))))
  return owners.find(area => area.id === origin) ?? owners[0]
}

export const moduleOf = (path: string) => NAVIGATION.flatMap(group => group.items).find(item => owns(item.to, path))?.module

/** Rótulo curto da tela ativa, para a guia do navegador. Na raiz do módulo usa o nome da barra. */
export function screenLabel(path: string, metaTitle?: string): string | undefined {
  if (path === '/' || path === '') return undefined
  const matches = NAVIGATION.flatMap(group => group.items)
    .filter((entry): entry is NavItem & { to: string } => !!entry.to && owns(entry.to, path))
    .sort((a, b) => b.to.length - a.to.length)
  const nav = matches[0]
  if (!nav) return metaTitle
  if (matches.filter(entry => entry.to.length === nav.to.length).length > 1) return metaTitle || nav.label
  if (path === nav.to || path === `${nav.to}/`) return nav.label
  return metaTitle || nav.label
}

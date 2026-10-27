import type { AccessProfile, Functionality, FunctionalityId, Role } from '../types/domain'

export const MODULES = [
  'Painel', 'Fluxo do pedido', 'Vendas', 'CRM', 'Produtos', 'Pessoas', 'Parceiros', 'Serviços', 'Ativos', 'Postos', 'Planejamento',
  'Ordens de produção', 'Demandas', 'Compras', 'Almoxarifado', 'Injeção', 'Montagem', 'Qualidade', 'Expedição',
  'Manutenção', 'Assistência Técnica', 'Indicadores', 'Projetos', 'Orçamentos', 'DRE', 'Organização', 'Integração Omie',
]

export const moduleFeature = (module: string): FunctionalityId => `modulo.${module.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_')}.consultar`

const moduleFeatures: Functionality[] = MODULES.map(module => ({
  id: moduleFeature(module),
  module,
  action: 'consultar',
  label: `Consultar ${module}`,
  description: `Permite visualizar o módulo ${module}.`,
}))

export const FUNCTIONALITIES: Functionality[] = [
  ...moduleFeatures,
  { id: 'organizacao.acessos.gerir', module: 'Organização', action: 'gerir_acessos', label: 'Gerir acessos', description: 'Cria perfis e atribui perfis a usuários.' },
  { id: 'organizacao.consultar_consolidado', module: 'Organização', action: 'consultar_consolidado', label: 'Consultar acessos do grupo', description: 'Vê o acesso das empresas autorizadas do grupo. A soma não edita.' },
  { id: 'orcamentos.gerir', module: 'Orçamentos', action: 'gerir', label: 'Gerir orçamento', description: 'Altera orçamento, categorias e configuração.' },
  { id: 'orcamentos.liberar_saldo', module: 'Orçamentos', action: 'liberar_saldo', label: 'Liberar saldo excedido', description: 'Decide previsão retida por saldo anual.' },
  { id: 'orcamentos.consultar_consolidado', module: 'Orçamentos', action: 'consultar_consolidado', label: 'Consultar consolidado de grupo', description: 'Consulta orçamento das empresas autorizadas do grupo econômico.' },
  { id: 'produtos.editar', module: 'Produtos', action: 'editar', label: 'Editar produtos', description: 'Mantém cadastros, estruturas e camadas do produto.' },
  { id: 'produtos.aprovar', module: 'Produtos', action: 'aprovar', label: 'Aprovar produto', description: 'Homologa e decide alterações de campos-chave.' },
]

const roleModuleGrants: Record<Role, string[]> = {
  Administrador: MODULES,
  Gestor: MODULES,
  Comercial: ['CRM', 'Vendas', 'Expedição', 'Produtos', 'Parceiros'],
  Engenharia: ['Produtos', 'Serviços', 'Ativos', 'Postos', 'Projetos', 'Parceiros'],
  PCP: ['Painel', 'Fluxo do pedido', 'Vendas', 'Produtos', 'Postos', 'Planejamento', 'Ordens de produção', 'Demandas', 'Injeção', 'Montagem', 'Indicadores', 'Parceiros'],
  Compras: ['Painel', 'Demandas', 'Compras', 'Almoxarifado', 'Orçamentos', 'Produtos', 'Parceiros'],
  Almoxarifado: ['Almoxarifado', 'Compras', 'Demandas', 'Ordens de produção', 'Produtos', 'Parceiros'],
  'Líder de produção': ['Painel', 'Fluxo do pedido', 'Planejamento', 'Ordens de produção', 'Demandas', 'Injeção', 'Montagem', 'Qualidade', 'Manutenção'],
  Operador: [],
  Qualidade: ['Qualidade', 'Ordens de produção', 'Indicadores'],
  Expedição: ['Expedição', 'Vendas', 'Parceiros'],
  Manutenção: ['Manutenção', 'Ativos', 'Postos', 'Serviços', 'Demandas', 'Injeção', 'Parceiros'],
  Assistência: ['Assistência Técnica', 'Serviços', 'Demandas', 'Almoxarifado', 'Parceiros'],
  Financeiro: ['Orçamentos', 'DRE', 'Projetos', 'Indicadores', 'Produtos', 'Parceiros'],
}

const profileDescription: Record<Role, string> = {
  Administrador: 'Perfil do sistema com todas as funcionalidades.',
  Gestor: 'Consulta ampla e decisões gerenciais.',
  Comercial: 'Relacionamento, propostas, vendas e expedição.',
  Engenharia: 'Produtos, estruturas, postos, serviços, ativos e projetos.',
  PCP: 'Planejamento e acompanhamento da produção.',
  Compras: 'Demandas, compras, estoque e orçamento.',
  Almoxarifado: 'Recebimento, separação, estoque e demandas.',
  'Líder de produção': 'Execução, planejamento e metas da fábrica.',
  Operador: 'Apontamentos somente pelo tablet.',
  Qualidade: 'Inspeções e não conformidades.',
  Expedição: 'Conferência, expedição e vendas.',
  Manutenção: 'Ativos, corretivas, preventivas e demandas.',
  Assistência: 'Chamados, serviços, demandas e peças.',
  Financeiro: 'Orçamento, projetos e indicadores.',
}

export const profileCode = (role: Role) => role.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-')

/**
 * Perfis da demonstração da Roboflex, para testar a visualização.
 * Um sistema zerado não recebe esta lista: a empresa nova nasce só com o Administrador,
 * e os demais perfis são criados na tela de acessos.
 */
export function seededProfiles(tenantId = 'tenant-roboflex'): AccessProfile[] {
  return (Object.keys(roleModuleGrants) as Role[]).map(role => {
    const functionalityIds = role === 'Administrador'
      ? FUNCTIONALITIES.map(entry => entry.id)
      : roleModuleGrants[role].map(moduleFeature)
    if (role === 'Gestor') functionalityIds.push('orcamentos.liberar_saldo', 'orcamentos.consultar_consolidado', 'organizacao.consultar_consolidado', 'produtos.aprovar')
    if (role === 'Financeiro') functionalityIds.push('orcamentos.gerir', 'orcamentos.consultar_consolidado')
    if (role === 'Engenharia') functionalityIds.push('produtos.editar', 'produtos.aprovar')
    return {
      id: `profile-${profileCode(role)}`,
      tenantId,
      code: profileCode(role),
      name: role,
      description: profileDescription[role],
      system: role === 'Administrador',
      functionalityIds,
      simulatedRole: role,
    }
  })
}

export function profileCan(profile: AccessProfile | undefined, functionality: FunctionalityId) {
  if (!profile) return false
  return profile.system || profile.functionalityIds.includes(functionality)
}

/** Compatibilidade do motor do mockup; na API real estas decisões usam funcionalidades do perfil. */
export const hasFullAccess = (role: Role) => role === 'Administrador' || role === 'Gestor'

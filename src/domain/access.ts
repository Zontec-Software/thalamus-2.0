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

const functionality = (id: FunctionalityId, module: string, action: string, label: string, description: string): Functionality => ({ id, module, action, label, description })

/**
 * Catálogo de autorização. Um perfil é apenas uma combinação destas chaves:
 * nomes como "Responsável financeiro" ou "Editor de estrutura" nunca são
 * pressupostos pelas regras de negócio.
 */
export const FUNCTIONALITIES: Functionality[] = [
  ...moduleFeatures,
  functionality('organizacao.acessos.gerir', 'Organização', 'gerir_acessos', 'Gerir acessos', 'Cria contas, perfis e atribui perfis a contas.'),
  functionality('organizacao.consultar_consolidado', 'Organização', 'consultar_consolidado', 'Consultar acessos do grupo', 'Vê o acesso das empresas autorizadas do grupo. A soma não edita.'),
  functionality('pessoas.dados_sensiveis.consultar', 'Pessoas', 'consultar_dados_sensiveis', 'Consultar dados sensíveis', 'Vê dados pessoais, saúde, banco e documentos da pessoa.'),
  functionality('pessoas.admissao.gerir', 'Pessoas', 'gerir_admissao', 'Gerir admissão', 'Cria vagas, conduz candidatos e efetiva vínculos.'),
  functionality('pessoas.desligamento.gerir', 'Pessoas', 'gerir_desligamento', 'Gerir desligamento', 'Inicia, executa e conclui desligamentos.'),
  functionality('pessoas.estrutura.gerir', 'Pessoas', 'gerir_estrutura', 'Gerir estrutura organizacional', 'Mantém setores, cargos, posições e vínculos.'),

  functionality('produtos.nucleo.gerir', 'Produtos', 'gerir_nucleo', 'Gerir cadastro e classificação', 'Cria produtos, classificação, atributos e dados gerais.'),
  functionality('produtos.estoque.gerir', 'Produtos', 'gerir_estoque', 'Gerir estoque e unidades', 'Mantém unidades, conversões, estoque e embalagem.'),
  functionality('produtos.manufatura.gerir', 'Produtos', 'gerir_manufatura', 'Gerir estrutura e roteiro', 'Mantém BOM, roteiro, revisões e mudanças de engenharia.'),
  functionality('produtos.ferramental.gerir', 'Produtos', 'gerir_ferramental', 'Gerir ferramental', 'Mantém moldes, gabaritos e dispositivos do produto.'),
  functionality('produtos.comercial.gerir', 'Produtos', 'gerir_comercial', 'Gerir comercial e preços', 'Mantém preços, tabelas, grade e condições comerciais.'),
  functionality('produtos.fiscal.gerir', 'Produtos', 'gerir_fiscal', 'Gerir fiscal', 'Mantém NCM, CEST, matriz fiscal e conflitos com o Omie.'),
  functionality('produtos.midia.gerir', 'Produtos', 'gerir_midia', 'Gerir mídia técnica', 'Inclui e organiza fotos, desenhos e instruções.'),
  functionality('produtos.projetos.gerir', 'Produtos', 'gerir_projetos', 'Gerir uso em projetos', 'Vincula produtos a projetos e marcos.'),
  functionality('produtos.ciclo.gerir', 'Produtos', 'gerir_ciclo', 'Gerir ciclo de vida', 'Envia para homologação, bloqueia, obsoleta e inativa produtos.'),
  functionality('produtos.homologar.fiscal', 'Produtos', 'homologar_fiscal', 'Homologar fiscal', 'Decide a aprovação fiscal do produto.'),
  functionality('produtos.homologar.pcp', 'Produtos', 'homologar_pcp', 'Homologar PCP', 'Decide a aprovação de estrutura e planejamento.'),
  functionality('produtos.homologar.comercial', 'Produtos', 'homologar_comercial', 'Homologar comercial', 'Decide a aprovação comercial do produto.'),
  functionality('produtos.homologar.tecnica', 'Produtos', 'homologar_tecnica', 'Homologar técnica', 'Decide a aprovação técnica e de mudanças de engenharia.'),
  functionality('produtos.excecao_campo_chave.decidir', 'Produtos', 'decidir_excecao_campo_chave', 'Decidir exceção de campo-chave', 'Aprova ou recusa alteração protegida em produto ativo.'),
  functionality('produtos.revisao.liberar', 'Produtos', 'liberar_revisao', 'Liberar revisão', 'Libera a revisão de estrutura e roteiro para produção.'),

  functionality('orcamentos.planejamento.gerir', 'Orçamentos', 'gerir_planejamento', 'Gerir planejamento', 'Define orçamento anual, mensal, CAPEX e simulações.'),
  functionality('orcamentos.categorias.gerir', 'Orçamentos', 'gerir_categorias', 'Gerir categorias', 'Mantém categorias, responsáveis, executores e destinações.'),
  functionality('orcamentos.excecao.tratar', 'Orçamentos', 'tratar_excecao', 'Tratar exceções financeiras', 'Classifica pagamentos, corrige sincronização e trata pendências.'),
  functionality('orcamentos.excecao.vincular', 'Orçamentos', 'vincular_excecao', 'Vincular exceção ao orçamento', 'Vincula documentos sem orçamento à categoria autorizada.'),
  functionality('orcamentos.liberar_saldo', 'Orçamentos', 'liberar_saldo', 'Liberar saldo excedido', 'Decide previsão retida por saldo anual.'),
  functionality('orcamentos.alerta.reconhecer', 'Orçamentos', 'reconhecer_alerta', 'Reconhecer alerta orçamentário', 'Registra ciência de alerta de limiar.'),
  functionality('orcamentos.consultar_consolidado', 'Orçamentos', 'consultar_consolidado', 'Consultar consolidado de grupo', 'Consulta orçamento das empresas autorizadas do grupo econômico.'),

  ...MODULES.filter(module => !['Produtos', 'Orçamentos', 'Organização', 'Pessoas'].includes(module))
    .map(module => functionality(`modulo.${module.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_')}.gerir`, module, 'gerir', `Gerir ${module}`, `Mantém registros e decisões do módulo ${module}.`)),
]

export const productFeature = (action: string): FunctionalityId => `produtos.${action}`
const budgetFeature = (action: string): FunctionalityId => `orcamentos.${action}`

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

const roleDetailedGrants: Partial<Record<Role, FunctionalityId[]>> = {
  Gestor: [
    productFeature('nucleo.gerir'), productFeature('estoque.gerir'), productFeature('manufatura.gerir'), productFeature('ferramental.gerir'),
    productFeature('comercial.gerir'), productFeature('fiscal.gerir'), productFeature('midia.gerir'), productFeature('projetos.gerir'),
    productFeature('ciclo.gerir'), productFeature('homologar.fiscal'), productFeature('homologar.pcp'), productFeature('homologar.comercial'),
    productFeature('homologar.tecnica'), productFeature('excecao_campo_chave.decidir'), productFeature('revisao.liberar'),
    budgetFeature('planejamento.gerir'), budgetFeature('categorias.gerir'), budgetFeature('excecao.tratar'), budgetFeature('excecao.vincular'),
    budgetFeature('liberar_saldo'), budgetFeature('alerta.reconhecer'), budgetFeature('consultar_consolidado'), 'organizacao.consultar_consolidado',
  ],
  Engenharia: [
    productFeature('nucleo.gerir'), productFeature('manufatura.gerir'), productFeature('ferramental.gerir'), productFeature('midia.gerir'),
    productFeature('projetos.gerir'), productFeature('ciclo.gerir'), productFeature('homologar.tecnica'), productFeature('revisao.liberar'),
  ],
  PCP: [productFeature('manufatura.gerir'), productFeature('homologar.pcp'), productFeature('revisao.liberar')],
  Compras: [productFeature('estoque.gerir'), budgetFeature('alerta.reconhecer')],
  Almoxarifado: [productFeature('estoque.gerir')],
  Comercial: [productFeature('comercial.gerir'), productFeature('midia.gerir'), productFeature('homologar.comercial')],
  Manutenção: [productFeature('ferramental.gerir')],
  Financeiro: [
    productFeature('fiscal.gerir'), productFeature('homologar.fiscal'), budgetFeature('planejamento.gerir'), budgetFeature('categorias.gerir'),
    budgetFeature('excecao.tratar'), budgetFeature('excecao.vincular'), budgetFeature('alerta.reconhecer'), budgetFeature('consultar_consolidado'),
  ],
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
    functionalityIds.push(...(roleDetailedGrants[role] ?? []))
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

/** O catálogo nasce do código. Um estado salvo não pode continuar exibindo permissões que já saíram. */
export function syncAccessCatalog(state: { functionalities: Functionality[]; accessProfiles: AccessProfile[] }) {
  const current = FUNCTIONALITIES.map(entry => ({ ...entry }))
  const valid = new Set(current.map(entry => entry.id))
  state.functionalities = current
  for (const profile of state.accessProfiles) {
    if (profile.system) {
      profile.functionalityIds = current.map(entry => entry.id)
      continue
    }
    const seeded = seededProfiles(profile.tenantId).find(entry => entry.id === profile.id)
    const stale = profile.functionalityIds.some(id => !valid.has(id))
    profile.functionalityIds = seeded && stale
      ? [...seeded.functionalityIds]
      : profile.functionalityIds.filter(id => valid.has(id))
  }
}

/** Compatibilidade do motor do mockup; na API real estas decisões usam funcionalidades do perfil. */
export const hasFullAccess = (role: Role) => role === 'Administrador' || role === 'Gestor'

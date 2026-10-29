import { APPROVAL_LABEL, approvalIssues, catalogOf, itemFlags, requiredApprovals } from '../../domain/catalog'
import type { ErpState } from '../../domain/engine'
import type { Item } from '../../types/domain'

export type ProductActionKind = 'Homologar' | 'Completar' | 'Estrutura' | 'Fiscal' | 'Mudança' | 'Ciclo'

export interface ProductAction {
  id: string
  kind: ProductActionKind
  title: string
  detail: string
  productId?: string
  changeId?: string
  aba?: string
}

const FLAG_ACTION: Record<string, { feature: string; title: string; aba: string; kind: ProductActionKind }> = {
  'Sem NCM': { feature: 'produtos.fiscal.gerir', title: 'Informar o NCM', aba: 'fiscal', kind: 'Fiscal' },
  'Sem CEST': { feature: 'produtos.fiscal.gerir', title: 'Informar o CEST', aba: 'fiscal', kind: 'Fiscal' },
  'GTIN × NCM divergente': { feature: 'produtos.fiscal.gerir', title: 'Alinhar GTIN e NCM', aba: 'fiscal', kind: 'Fiscal' },
  'Fiscal em conflito com o Omie': { feature: 'produtos.fiscal.gerir', title: 'Resolver conflito fiscal com o Omie', aba: 'fiscal', kind: 'Fiscal' },
  'Sem estrutura': { feature: 'produtos.manufatura.gerir', title: 'Montar a estrutura', aba: 'manufatura', kind: 'Estrutura' },
  'Sem roteiro': { feature: 'produtos.manufatura.gerir', title: 'Montar o roteiro', aba: 'manufatura', kind: 'Estrutura' },
  'Sem EAN': { feature: 'produtos.nucleo.gerir', title: 'Informar o EAN', aba: 'nucleo', kind: 'Completar' },
  'Sem preço': { feature: 'produtos.comercial.gerir', title: 'Informar o preço', aba: 'comercial', kind: 'Completar' },
  'Atributos pendentes': { feature: 'produtos.nucleo.gerir', title: 'Completar atributos obrigatórios', aba: 'nucleo', kind: 'Completar' },
  'Ferramental incompleto': { feature: 'produtos.ferramental.gerir', title: 'Completar o ferramental', aba: 'ferramental', kind: 'Completar' },
  'Obsoleto com saldo': { feature: 'produtos.ciclo.gerir', title: 'Tratar saldo de produto obsoleto', aba: 'ciclo', kind: 'Ciclo' },
}

const closedChange = (stage: string) => stage === 'Implementada' || stage === 'Recusada'

function push(list: ProductAction[], action: ProductAction) {
  list.push(action)
}

function productDetail(item: Item) {
  return `${item.code} · ${item.name}`
}

/** Pendências do cadastro que o perfil atual pode resolver. Quem não tem a funcionalidade não vê a linha. */
export function productActions(state: ErpState, can: (feature: string) => boolean, actorName: string): ProductAction[] {
  const actions: ProductAction[] = []
  const live = state.items.filter(item => !catalogOf(item).deletedAt)

  for (const item of live) {
    const catalog = catalogOf(item)
    const specific: ProductAction[] = []
    for (const flag of itemFlags(state, item)) {
      if (flag === 'Versão em rascunho') {
        if (!can('produtos.manufatura.gerir') && !can('produtos.revisao.liberar')) continue
        specific.push({
          id: `${item.id}-revisao`,
          kind: 'Estrutura',
          title: can('produtos.revisao.liberar') && !can('produtos.manufatura.gerir') ? 'Liberar a versão em rascunho' : 'Concluir a versão em rascunho',
          detail: productDetail(item),
          productId: item.id,
          aba: 'manufatura',
        })
        continue
      }
      const mapped = FLAG_ACTION[flag]
      if (!mapped || !can(mapped.feature)) continue
      specific.push({ id: `${item.id}-${flag}`, kind: mapped.kind, title: mapped.title, detail: productDetail(item), productId: item.id, aba: mapped.aba })
    }

    if (catalog.lifecycle === 'Rascunho' && can('produtos.nucleo.gerir') && !specific.length) {
      specific.push({ id: `${item.id}-rascunho`, kind: 'Completar', title: 'Concluir o rascunho', detail: productDetail(item), productId: item.id, aba: 'nucleo' })
    }
    if (catalog.lifecycle === 'Em homologação') {
      for (const role of requiredApprovals(item).filter(entry => !catalog.approvals[entry])) {
        if (!can(`produtos.homologar.${role}`)) continue
        const issues = approvalIssues(item, role)
        specific.push({
          id: `${item.id}-homologar-${role}`,
          kind: 'Homologar',
          title: issues.length ? `Completar homologação ${APPROVAL_LABEL[role].toLowerCase()}` : `Homologar ${APPROVAL_LABEL[role].toLowerCase()}`,
          detail: issues.length ? `${productDetail(item)} · ${issues.join(' · ')}` : productDetail(item),
          productId: item.id,
          aba: role === 'fiscal' ? 'fiscal' : role === 'comercial' ? 'comercial' : role === 'pcp' ? 'manufatura' : 'ciclo',
        })
      }
    }
    for (const change of catalog.keyChanges.filter(entry => entry.status === 'Pendente')) {
      if (!can('produtos.excecao_campo_chave.decidir') || change.requestedBy === actorName) continue
      specific.push({
        id: `${item.id}-excecao-${change.id}`,
        kind: 'Homologar',
        title: 'Decidir exceção de campo-chave',
        detail: `${productDetail(item)} · ${change.field === 'ncm' ? 'NCM' : change.field === 'unit' ? 'Unidade' : change.field}: ${change.from || '—'} → ${change.to}`,
        productId: item.id,
        aba: 'ciclo',
      })
    }
    if (catalog.lifecycle === 'Inativação pendente' && can('produtos.ciclo.gerir')) {
      specific.push({ id: `${item.id}-inativar`, kind: 'Ciclo', title: 'Decidir a inativação', detail: productDetail(item), productId: item.id, aba: 'ciclo' })
    }
    if (catalog.lifecycle === 'Bloqueado' && can('produtos.ciclo.gerir')) {
      specific.push({ id: `${item.id}-bloqueio`, kind: 'Ciclo', title: 'Revisar produto bloqueado', detail: productDetail(item), productId: item.id, aba: 'ciclo' })
    }
    if (catalog.fiscalSync?.status === 'Enviar ao Omie' && can('produtos.fiscal.gerir')) {
      specific.push({ id: `${item.id}-enviar-fiscal`, kind: 'Fiscal', title: 'Enviar o fiscal ao Omie', detail: productDetail(item), productId: item.id, aba: 'fiscal' })
    }
    actions.push(...specific)
  }

  for (const change of state.engineeringChanges.filter(entry => !closedChange(entry.stage))) {
    const canConduct = can('produtos.manufatura.gerir')
    const canApprove = can('produtos.homologar.tecnica')
    const canRelease = can('produtos.revisao.liberar')
    let title = ''
    if ((change.stage === 'Solicitada' || change.stage === 'Em análise') && canConduct) title = 'Conduzir mudança de engenharia'
    else if (change.stage === 'Em análise' && canApprove) title = 'Aprovar mudança de engenharia'
    else if (change.stage === 'Aprovada' && (canConduct || canRelease)) title = 'Implementar mudança de engenharia'
    if (!title) continue
    const codes = change.itemIds.map(id => state.items.find(item => item.id === id)?.code).filter(Boolean).join(', ')
    push(actions, {
      id: change.id,
      kind: 'Mudança',
      title,
      detail: `${change.id} · ${change.title}${codes ? ` · ${codes}` : ''}`,
      changeId: change.id,
      productId: change.itemIds[0],
      aba: 'mudancas',
    })
  }

  return actions.sort((a, b) => a.kind.localeCompare(b.kind, 'pt-BR') || a.title.localeCompare(b.title, 'pt-BR') || a.detail.localeCompare(b.detail, 'pt-BR'))
}

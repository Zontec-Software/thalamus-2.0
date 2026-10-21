import type { OmieCategory, OmiePayment, Requisition, SalesOrder } from '../../types/domain'

/**
 * Contrato entre o domínio de produção e o Omie. A implementação real deve rodar no backend
 * (credenciais nunca no navegador), com fila, retentativa e idempotência por id externo.
 */
export interface OmieGateway {
  fetchApprovedOrders(): Promise<SalesOrder[]>
  fetchPaidInvoices(): Promise<OmiePayment[]>
  fetchCategories(): Promise<OmieCategory[]>
  createPurchaseOrder(requisition: Requisition): Promise<{ omieId: string }>
  requestInvoice(order: SalesOrder): Promise<{ invoice: string }>
  adjustInventory(itemCode: string, delta: number, reason: string): Promise<void>
}

export interface OmieOwnership {
  data: string
  owner: 'Omie' | 'Thalamus'
  direction: 'Omie → Thalamus' | 'Thalamus → Omie' | 'Bidirecional'
  trigger: string
}

export const OWNERSHIP: OmieOwnership[] = [
  { data: 'Clientes e condições comerciais', owner: 'Omie', direction: 'Omie → Thalamus', trigger: 'Webhook + conciliação diária' },
  { data: 'Pedidos de venda aprovados', owner: 'Omie', direction: 'Omie → Thalamus', trigger: 'Webhook de aprovação' },
  { data: 'Cadastro fiscal do item (NCM, Ex-TIPI, CEST, origem, benefício por UF, reforma)', owner: 'Thalamus', direction: 'Thalamus → Omie', trigger: 'Ativação do item e cada vigência que entra' },
  { data: 'Apuração fiscal e NF-e (CST e alíquota aplicados na nota)', owner: 'Omie', direction: 'Omie → Thalamus', trigger: 'Emissão da nota' },
  { data: 'Códigos de barras do item (EAN, DUN, UPC)', owner: 'Thalamus', direction: 'Thalamus → Omie', trigger: 'Ativação do item e troca do código principal' },
  { data: 'Tabelas de preço de venda', owner: 'Thalamus', direction: 'Thalamus → Omie', trigger: 'Preço que entra em vigência' },
  { data: 'Mídia do item (fotos, desenhos, fichas)', owner: 'Thalamus', direction: 'Thalamus → Omie', trigger: 'Publicação do item' },
  { data: 'Estrutura, roteiro e revisão do produto', owner: 'Thalamus', direction: 'Thalamus → Omie', trigger: 'Liberação de revisão' },
  { data: 'Reservas, OPs e apontamentos', owner: 'Thalamus', direction: 'Thalamus → Omie', trigger: 'Encerramento da OP (consolidado)' },
  { data: 'Pedido de compra', owner: 'Thalamus', direction: 'Thalamus → Omie', trigger: 'Aprovação da requisição' },
  { data: 'Categoria financeira', owner: 'Thalamus', direction: 'Bidirecional', trigger: 'Criação ou alteração aqui, inclusive inativar (conta_inativa), e conciliação do que mudou no Omie' },
  { data: 'Orçamento anual', owner: 'Thalamus', direction: 'Thalamus → Omie', trigger: 'Classificação do documento de origem' },
  { data: 'Nota de custo', owner: 'Omie', direction: 'Omie → Thalamus', trigger: 'A nota entra no realizado. O vínculo com compra, projeto ou ordem é manual até esses módulos enviarem o documento' },
  { data: 'Recebimento / NF-e de entrada', owner: 'Omie', direction: 'Omie → Thalamus', trigger: 'Webhook de recebimento' },
  { data: 'Saldo contábil de estoque', owner: 'Omie', direction: 'Bidirecional', trigger: 'Ajustes com motivo + conciliação' },
  { data: 'Faturamento e NF-e de saída', owner: 'Omie', direction: 'Omie → Thalamus', trigger: 'Solicitado na expedição' },
]

import type { OmieCategory, OmiePayment, Requisition, SalesOrder } from '../../types/domain'
import type { OmieGateway } from './gateway'

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds))

/** Simula o Omie com latência. A fila de pedidos aprovados é lida do estado de demonstração. */
export class MockOmieGateway implements OmieGateway {
  private invoiceNumber = 18500
  private readonly approvedQueue: () => SalesOrder[]
  private readonly paymentQueue: () => OmiePayment[]
  private readonly latency: number
  categoryInbox: () => OmieCategory[] = () => []

  constructor(approvedQueue: () => SalesOrder[], paymentQueueOrLatency: (() => OmiePayment[]) | number = () => [], latency = 1200) {
    this.approvedQueue = approvedQueue
    this.paymentQueue = typeof paymentQueueOrLatency === 'function' ? paymentQueueOrLatency : () => []
    this.latency = typeof paymentQueueOrLatency === 'number' ? paymentQueueOrLatency : latency
  }

  async fetchApprovedOrders(): Promise<SalesOrder[]> {
    await wait(this.latency)
    const queue = this.approvedQueue()
    return queue.splice(0, queue.length).map(order => ({ ...order }))
  }

  async fetchPaidInvoices(): Promise<OmiePayment[]> {
    await wait(this.latency / 2)
    const queue = this.paymentQueue()
    return queue.splice(0, queue.length).map(payment => ({ ...payment, categoryIds: [...payment.categoryIds] }))
  }

  async fetchCategories(): Promise<OmieCategory[]> {
    await wait(this.latency / 2)
    return this.categoryInbox().splice(0).map(category => ({ ...category }))
  }

  async createPurchaseOrder(requisition: Requisition): Promise<{ omieId: string }> {
    await wait(this.latency / 2)
    return { omieId: `PC-${requisition.id.replace('RC-', '')}` }
  }

  async requestInvoice(): Promise<{ invoice: string }> {
    await wait(this.latency * 3)
    this.invoiceNumber += 1
    return { invoice: `NF-e ${this.invoiceNumber}` }
  }

  async adjustInventory(): Promise<void> {
    await wait(this.latency / 2)
  }
}

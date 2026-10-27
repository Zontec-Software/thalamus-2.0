import { googleResult } from '../../domain/directory'
import type { GoogleGateway } from './gateway'

/** O mesmo resultado do domínio, atrás do contrato que o backend vai cumprir. */
export class MockGoogleGateway implements GoogleGateway {
  async createUser(input: { email: string; name: string }) {
    const result = googleResult('Criar', input.email)
    if (!result.ok) throw new Error(result.failure)
    return { externalId: result.externalId }
  }

  async suspendUser(input: { externalId: string }) {
    const result = googleResult('Suspender', input.externalId.replace(/^gws-/, ''))
    if (!result.ok) throw new Error(result.failure)
    return undefined
  }
}

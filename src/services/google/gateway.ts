/**
 * Contrato da conta Google da empresa. A implementação real roda no backend:
 * o segredo de administrador fica no cofre e a senha da pessoa nunca volta para o Thalamus.
 */
export interface GoogleGateway {
  createUser(input: { domain: string; email: string; name: string }): Promise<{ externalId: string }>
  suspendUser(input: { domain: string; externalId: string }): Promise<void>
}

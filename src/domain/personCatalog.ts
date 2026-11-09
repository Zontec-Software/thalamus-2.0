/** Listas fechadas da ficha. Vazio continua permitido. A mesma lista vale na API. */

export const SEX = ['Feminino', 'Masculino']
export const GENDER = ['Cisgênero', 'Transgênero', 'Outro', 'Prefiro não informar']
export const MARITAL_STATUS = ['Solteiro(a)', 'Casado(a)', 'União estável', 'Divorciado(a)', 'Separado(a)', 'Viúvo(a)']
export const EDUCATION = [
  'Fundamental incompleto', 'Fundamental completo', 'Médio incompleto', 'Médio completo', 'Técnico',
  'Superior incompleto', 'Superior completo', 'Pós-graduação', 'Mestrado', 'Doutorado',
]
export const CNH_CATEGORIES = ['A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE']
export const STATES = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO']
export const RACE = ['Branca', 'Preta', 'Parda', 'Amarela', 'Indígena', 'Não declarada']
export const PCD = ['Não', 'Física', 'Auditiva', 'Visual', 'Intelectual', 'Psicossocial', 'Múltipla']
export const SHIRT_SIZES = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XXG']
export const SHOE_SIZES = Array.from({ length: 16 }, (_, index) => String(33 + index))
export const BONDS = ['Cônjuge', 'Filho(a)', 'Pai', 'Mãe', 'Irmão(ã)', 'Dependente', 'Outro']
export const ACCOUNT_KINDS = ['Corrente', 'Poupança', 'Salário']

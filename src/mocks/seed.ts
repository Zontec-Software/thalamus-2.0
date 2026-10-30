import {
  addSyncLog, advanceRequisition, approveInspection, confirmShipment, createMaintenance, finishOperation, invoiceOrder,
  approveFirstPiece, pauseOperation, pickOp, planOrder, raiseAlert, rejectInspection, reportProduction, setClock, shipOrder,
  startOperation, updateNonConformity, type ErpState,
} from '../domain/engine'
import { defaultCatalog, ensureClassPath, seedPath, withCheckDigit } from '../domain/catalog'
import { FUNCTIONALITIES, moduleFeature, profileCode, seededProfiles } from '../domain/access'
import type { BusinessPartner, Item, PartnerRoleName, RouteStep, SalesOrder } from '../types/domain'

const mp = (id: string, code: string, name: string, stock: number, minimum: number, cost: number, supplier: string, leadTimeDays: number): Item =>
  ({ id, code, name, type: '01', unit: 'kg', stock, minimum, cost, supplier, leadTimeDays, location: 'Silo / A-01' })

const cp = (id: string, code: string, name: string, stock: number, minimum: number, cost: number, supplier: string, leadTimeDays: number, type: Item['type'] = '01'): Item =>
  ({ id, code, name, type, unit: 'un', stock, minimum, cost, supplier, leadTimeDays, location: type === '02' ? 'Estoque C-04' : 'Almox B-02' })

const se = (id: string, code: string, name: string, stock: number, moldId: string, cycleSeconds: number, cavities: number, resin: string, resinKg: number, type: Item['type'] = '06'): Item =>
  ({ id, code, name, type, unit: 'un', stock, minimum: 50, cost: 6, moldId, cycleSeconds, cavities, bom: [{ itemId: resin, quantity: resinKg, loss: 3 }], location: 'Supermercado injeção' })

const step = (id: string, name: string, resourceId: string, minutesPerUnit: number, instructions: string[], extra: Partial<RouteStep> = {}): RouteStep => ({ id, name, resourceId, minutesPerUnit, instructions, ...extra })

const fe = (id: string, code: string, name: string, cost: number): Item =>
  ({ id, code, name, type: '08', unit: 'un', stock: 1, minimum: 0, cost, location: 'Ferramentaria' })

/** Roteiro da peça injetada: o tempo por peça sai do ciclo ÷ cavidades ativas do molde. */
const injection = (toolId: string, resourceId: string, cycleSeconds: number, activeCavities: number, extraSteps: RouteStep[] = []): RouteStep[] => [
  step('inj', 'Injeção', resourceId, Math.round(cycleSeconds / activeCavities / 60 * 10000) / 10000, ['Montar e aquecer o molde', 'Liberar primeira peça com a qualidade', 'Separar refugo por motivo'], { toolId, setupMinutes: 45, crew: 1, firstPiece: true }),
  ...extraSteps,
]

function bp(input: Pick<BusinessPartner, 'id' | 'name' | 'document' | 'roles' | 'city' | 'contact' | 'email'> & Partial<BusinessPartner>): BusinessPartner {
  const [city, state] = input.city.split(',').map(part => part.trim())
  const contacts = input.contacts ?? [{ name: input.contact, duty: 'Principal', phone: '', email: input.email }]
  const addresses = input.addresses ?? [{ purpose: 'Sede' as const, line: '', city, state: state ?? '' }]
  const roles = input.roles as PartnerRoleName[]
  return {
    personType: 'Jurídica', legalName: input.name, tradeName: input.name,
    roleStatus: Object.fromEntries(roles.map(role => [role, 'Ativo' as const])),
    contacts, addresses, origin: 'Carga inicial', createdAt: '2026-08-01T12:00:00.000Z', createdBy: 'Carga inicial',
    audit: [], abcSuggestions: [], status: 'Ativo', ...input, roles,
  }
}

function baseState(): ErpState {
  return {
    itemClasses: [],
    customers: [
      { id: 'c1', name: 'Mineradora Horizonte', city: 'Itabira, MG', omieCode: 'CL-1022' },
      { id: 'c2', name: 'Translog Brasil', city: 'Contagem, MG', omieCode: 'CL-1187' },
      { id: 'c3', name: 'Agro Vale Verde', city: 'Rio Verde, GO', omieCode: 'CL-1340' },
      { id: 'c4', name: 'Hotel Serra Azul', city: 'Gramado, RS', omieCode: 'CL-1412' },
      { id: 'c5', name: 'Porto Leste', city: 'Vitória, ES', omieCode: 'CL-1455' },
      { id: 'c6', name: 'Rede Varejo Prime', city: 'São Paulo, SP', omieCode: 'CL-1501' },
    ],
    resources: [
      { id: 'inj1', tenantId: 'tenant-roboflex', name: 'Injetora 01 · 180 t', kind: 'Injetora', status: 'Ativo', dailyMinutes: 960, hourlyRate: 95 },
      { id: 'inj2', tenantId: 'tenant-roboflex', name: 'Injetora 02 · 250 t', kind: 'Injetora', status: 'Ativo', dailyMinutes: 960, hourlyRate: 120 },
      { id: 'inj3', tenantId: 'tenant-roboflex', name: 'Injetora 03 · 350 t', kind: 'Injetora', status: 'Ativo', dailyMinutes: 960, hourlyRate: 145 },
      { id: 'inj4', tenantId: 'tenant-roboflex', name: 'Injetora 04 · 80 t', kind: 'Injetora', status: 'Inativo', dailyMinutes: 480, hourlyRate: 70 },
      { id: 'mont1', tenantId: 'tenant-roboflex', name: 'Montagem · Célula 1', kind: 'Montagem', status: 'Ativo', dailyMinutes: 880, hourlyRate: 14 },
      { id: 'mont2', tenantId: 'tenant-roboflex', name: 'Montagem · Célula 2', kind: 'Montagem', status: 'Ativo', dailyMinutes: 880, hourlyRate: 14 },
      { id: 'elet', tenantId: 'tenant-roboflex', name: 'Eletrônica e testes', kind: 'Montagem', status: 'Ativo', dailyMinutes: 440, hourlyRate: 22 },
      { id: 'alm', tenantId: 'tenant-roboflex', name: 'Almoxarifado', kind: 'Almoxarifado', status: 'Ativo', dailyMinutes: 880 },
      { id: 'qual', tenantId: 'tenant-roboflex', name: 'Qualidade', kind: 'Qualidade', status: 'Ativo', dailyMinutes: 440 },
      { id: 'exp', tenantId: 'tenant-roboflex', name: 'Expedição', kind: 'Expedição', status: 'Ativo', dailyMinutes: 440 },
    ],
    assets: [
      { id: 'a-inj1', name: 'Injetora 01 · Haitian 180 t', kind: 'Injetora', resourceId: 'inj1', nextPreventive: '2026-10-28', acquisitionValue: 820000, usefulLifeYears: 10 },
      { id: 'a-inj2', name: 'Injetora 02 · Romi 250 t', kind: 'Injetora', resourceId: 'inj2', nextPreventive: '2026-11-04', acquisitionValue: 640000, usefulLifeYears: 10 },
      { id: 'a-inj3', name: 'Injetora 03 · Romi 350 t', kind: 'Injetora', resourceId: 'inj3', nextPreventive: '2026-10-20', acquisitionValue: 910000, usefulLifeYears: 10 },
      { id: 'mold-a11f', name: 'Molde M-112 · Moldura A11', kind: 'Molde', resourceId: 'inj1', shots: 182400, nextPreventive: '2026-10-25', acquisitionValue: 148000, usefulLifeYears: 5 },
      { id: 'mold-a11t', name: 'Molde M-113 · Tampa A11', kind: 'Molde', resourceId: 'inj2', shots: 96500, nextPreventive: '2026-11-10', acquisitionValue: 132000, usefulLifeYears: 5 },
      { id: 'mold-a11b', name: 'Molde M-114 · Bumper A11', kind: 'Molde', resourceId: 'inj3', shots: 64200, nextPreventive: '2026-11-18', acquisitionValue: 176000, usefulLifeYears: 5 },
      { id: 'mold-s9f', name: 'Molde M-121 · Moldura S9 FE', kind: 'Molde', resourceId: 'inj2', shots: 41800, nextPreventive: '2026-12-01' },
      { id: 'mold-s9t', name: 'Molde M-122 · Tampa S9 FE', kind: 'Molde', resourceId: 'inj1', shots: 39700, nextPreventive: '2026-12-01' },
      { id: 'mold-lite', name: 'Molde M-090 · Base Mesa Lite', kind: 'Molde', resourceId: 'inj1', shots: 228000, preventiveLimit: 228020, nextPreventive: '2026-10-18', acquisitionValue: 98000, usefulLifeYears: 5 },
      { id: 'a-teste', name: 'Bancada de teste de estanqueidade', kind: 'Equipamento', resourceId: 'elet', nextPreventive: '2026-11-30', acquisitionValue: 45000, usefulLifeYears: 10 },
    ],
    items: [
      mp('mp-abs', 'MP-ABS-01', 'ABS preto UV', 420, 150, 18.5, 'Polímeros Minas', 5),
      mp('mp-tpu', 'MP-TPU-04', 'TPU antichoque 85A', 2, 40, 42, 'TecnoPoli', 8),
      mp('mp-pc', 'MP-PC-02', 'Policarbonato cristal', 95, 50, 35, 'Plastcom', 10),
      cp('cp-cabo', 'CP-CAB-12', 'Cabo USB-C reforçado 1,2 m', 200, 80, 14, 'Conecta Brasil', 7),
      cp('cp-placa', 'CP-PLC-07', 'Placa de carregamento pogo pin', 80, 40, 58, 'EletroSul', 15),
      cp('cp-pelic', 'CP-VID-09', 'Película de vidro 10,9"', 400, 100, 9, 'GlassTech', 12),
      cp('cp-paraf', 'CP-PAR-03', 'Parafuso inox M2 x 6', 4000, 800, 0.09, 'Fix Parafusos', 4),
      cp('cp-alca', 'CP-ALC-05', 'Alça de mão com velcro', 260, 60, 11, 'Têxtil Minas', 6),
      cp('cp-suporte', 'CP-SUP-03', 'Suporte articulado de mesa', 45, 20, 64, 'MetalFlex', 10),
      cp('em-hard', 'EM-CX-07', 'Caixa individual Linha Hard', 420, 100, 3.2, 'Pack BH', 4, '02'),
      cp('em-lite', 'EM-CX-02', 'Caixa individual Linha Lite', 80, 50, 2.1, 'Pack BH', 4, '02'),
      se('se-mold-a11', 'SE-MLD-A11', 'Moldura frontal Tab A11', 110, 'mold-a11f', 42, 2, 'mp-abs', 0.11),
      se('se-tampa-a11', 'SE-TMP-A11', 'Tampa traseira Tab A11', 200, 'mold-a11t', 48, 1, 'mp-abs', 0.16),
      se('se-bump-a11', 'SE-BMP-A11', 'Bumper TPU Tab A11', 100, 'mold-a11b', 55, 2, 'mp-tpu', 0.08),
      se('se-mold-s9', 'SE-MLD-S9', 'Moldura frontal Tab S9 FE', 0, 'mold-s9f', 46, 2, 'mp-abs', 0.13, '03'),
      se('se-tampa-s9', 'SE-TMP-S9', 'Tampa traseira Tab S9 FE', 64, 'mold-s9t', 52, 1, 'mp-abs', 0.19),
      se('se-base-lite', 'SE-BAS-LT', 'Base Mesa Lite iPad', 70, 'mold-lite', 38, 1, 'mp-pc', 0.22),
      fe('fe-m112', 'FE-M112', 'Molde M-112 · Moldura A11', 148000),
      fe('fe-m113', 'FE-M113', 'Molde M-113 · Tampa A11', 132000),
      fe('fe-m114', 'FE-M114', 'Molde M-114 · Bumper A11', 176000),
      fe('fe-m121', 'FE-M121', 'Molde M-121 · Moldura S9 FE', 0),
      fe('fe-m122', 'FE-M122', 'Molde M-122 · Tampa S9 FE', 0),
      fe('fe-m090', 'FE-M090', 'Molde M-090 · Base Mesa Lite', 98000),
      fe('fe-g11', 'FE-G11', 'Gabarito G-11 · montagem Case A11', 4200),
      {
        id: 'pa-a11-ext', code: 'RF-H-A11-EXT', name: 'Case Extreme', variant: 'Samsung Tab A11', family: 'Hard', revision: 'C', type: '04', unit: 'un', stock: 0, minimum: 0, cost: 186, location: 'Expedição E-01',
        bom: [{ itemId: 'se-mold-a11', quantity: 1 }, { itemId: 'se-tampa-a11', quantity: 1 }, { itemId: 'se-bump-a11', quantity: 1 }, { itemId: 'cp-cabo', quantity: 1 }, { itemId: 'cp-placa', quantity: 1 }, { itemId: 'cp-pelic', quantity: 1 }, { itemId: 'cp-paraf', quantity: 8 }, { itemId: 'cp-alca', quantity: 1 }, { itemId: 'em-hard', quantity: 1 }],
        routing: [
          step('mec', 'Montagem mecânica', 'mont1', 6, ['Encaixar tablet de teste no gabarito G-11', 'Fixar moldura com 8 parafusos (torque 0,4 N·m)', 'Aplicar película sem bolhas']),
          step('ele', 'Instalação elétrica', 'elet', 5, ['Instalar placa pogo pin', 'Passar cabo USB-C pelo canal lateral', 'Conferir polaridade com multímetro']),
          step('tst', 'Teste funcional', 'elet', 2, ['Testar carregamento por 60 s', 'Registrar falhas no tablet']),
          step('emb', 'Embalagem', 'mont1', 1.5, ['Inserir alça e manual', 'Etiquetar caixa com lote da OP']),
        ],
      },
      {
        id: 'pa-a11-imp', code: 'RF-H-A11-IMP', name: 'Case Impact', variant: 'Samsung Tab A11', family: 'Hard', revision: 'B', type: '04', unit: 'un', stock: 0, minimum: 0, cost: 112, location: 'Expedição E-01',
        bom: [{ itemId: 'se-mold-a11', quantity: 1 }, { itemId: 'se-tampa-a11', quantity: 1 }, { itemId: 'se-bump-a11', quantity: 1 }, { itemId: 'cp-pelic', quantity: 1 }, { itemId: 'cp-paraf', quantity: 6 }, { itemId: 'em-hard', quantity: 1 }],
        routing: [
          step('mec', 'Montagem mecânica', 'mont2', 4, ['Encaixar bumper na tampa traseira', 'Fixar moldura com 6 parafusos', 'Aplicar película']),
          step('emb', 'Embalagem', 'mont2', 1, ['Etiquetar caixa com lote da OP']),
        ],
      },
      {
        id: 'pa-s9-min', code: 'RF-H-S9-MIN', name: 'Case Mining', variant: 'Galaxy Tab S9 FE', family: 'Hard', revision: 'A', type: '04', unit: 'un', stock: 0, minimum: 0, cost: 238, location: 'Expedição E-02',
        bom: [{ itemId: 'se-mold-s9', quantity: 1 }, { itemId: 'se-tampa-s9', quantity: 1 }, { itemId: 'cp-cabo', quantity: 1 }, { itemId: 'cp-placa', quantity: 1 }, { itemId: 'cp-pelic', quantity: 1 }, { itemId: 'cp-paraf', quantity: 10 }, { itemId: 'cp-alca', quantity: 1 }, { itemId: 'em-hard', quantity: 1 }],
        routing: [
          step('mec', 'Montagem mecânica', 'mont1', 7, ['Montar conjunto no gabarito G-21', 'Fixar 10 parafusos inox']),
          step('ved', 'Vedação IP65', 'mont1', 4, ['Aplicar junta de silicone no perímetro', 'Cura mínima de 10 minutos']),
          step('ele', 'Instalação elétrica', 'elet', 5, ['Instalar placa pogo pin e cabo']),
          step('est', 'Teste de estanqueidade', 'elet', 3, ['Pressurizar a 0,3 bar por 30 s', 'Reprovar se queda > 5%']),
          step('emb', 'Embalagem', 'mont1', 1.5, ['Etiquetar caixa com lote da OP']),
        ],
      },
      {
        id: 'pa-lite-ipad', code: 'RF-L-IP10-MSA', name: 'Mesa Lite', variant: 'iPad 10ª geração', family: 'Lite', revision: 'A', type: '04', unit: 'un', stock: 0, minimum: 0, cost: 96, location: 'Expedição E-03',
        bom: [{ itemId: 'se-base-lite', quantity: 1 }, { itemId: 'cp-suporte', quantity: 1 }, { itemId: 'cp-paraf', quantity: 4 }, { itemId: 'em-lite', quantity: 1 }],
        routing: [
          step('mec', 'Montagem do suporte', 'mont2', 3, ['Fixar suporte articulado na base', 'Testar giro de 360°']),
          step('emb', 'Embalagem', 'mont2', 1, ['Etiquetar caixa Linha Lite']),
        ],
      },
      mp('mp-abs-cinza', 'RF-10001', 'ABS cinza UV', 0, 0, 19, 'Polímeros Minas', 5),
      cp('cp-pelic-11', 'RF-10002', 'Película de vidro 11"', 0, 0, 11, 'GlassTech', 12),
      cp('mr-carregador', 'RF-10007', 'Carregador USB-C avulso', 36, 12, 48, 'Conecta Brasil', 7, '00'),
      cp('uc-luva', 'RF-10008', 'Luva nitrílica descartável', 800, 200, 0.42, 'Pack BH', 4, '07'),
      {
        id: 'kt-vitrine', code: 'RF-10004', name: 'Kit vitrine Impact', type: '04', unit: 'un', stock: 0, minimum: 0, cost: 0, location: '—',
        bom: [{ itemId: 'pa-a11-imp', quantity: 1 }, { itemId: 'cp-pelic', quantity: 2 }],
      },
      {
        id: 'kf-frota', code: 'RF-10006', name: 'Kit frota Impact', type: '04', unit: 'kit', stock: 0, minimum: 0, cost: 0, location: 'Expedição E-01',
        bom: [{ itemId: 'pa-a11-imp', quantity: 5 }, { itemId: 'em-hard', quantity: 1 }],
        routing: [step('kit', 'Montagem do kit', 'mont2', 2, ['Conferir 5 cases Impact', 'Embalar na caixa master', 'Etiquetar kit'])],
      },
      { id: 'im-rack', code: 'RF-10005', name: 'Rack de carga portuário', type: '08', unit: 'un', stock: 1, minimum: 0, cost: 2400, location: 'Expedição' },
    ],
    jobOpenings: [],
    candidates: [],
    applications: [],
    interviews: [],
    selectionReviews: [],
    peopleChecklists: [],
    candidateBriefings: [],
    assignments: [],
    performanceReviews: [],
    offboardings: [],
    accessRevocations: [],
    persons: [],
    workspaceConnections: [],
    directoryAccounts: [],
    employments: [],
    identityLinks: [],
    projectParticipations: [],
    users: [
      { id: 'u-master', name: 'Mestre da plataforma', role: 'Administrador', sector: 'Plataforma', shift: 'Administrativo', pin: '9000', email: 'plataforma@thalamus.local', active: true, platformMaster: true },
      { id: 'u16', name: 'Lucas Lima', role: 'Administrador', sector: 'Diretoria industrial', shift: 'Administrativo', pin: '0000', email: 'lucas.lima@roboflex.com.br', positionId: 'pos-dir', active: true },
      { id: 'u1', name: 'Marina Souza', role: 'Gestor', sector: 'Diretoria industrial', shift: 'Administrativo', pin: '1111', email: 'marina@roboflex.com.br', active: true },
      { id: 'u1', name: 'Marina Souza', role: 'Gestor', sector: 'Diretoria industrial', shift: 'Administrativo', pin: '1111', email: 'marina@roboflex.com.br', active: true },
      { id: 'u12', name: 'Camila Nunes', role: 'Comercial', sector: 'Comercial', shift: 'Administrativo', pin: '1212', email: 'camila@roboflex.com.br', positionId: 'pos-com', active: true },
      { id: 'u13', name: 'Eduardo Freitas', role: 'Engenharia', sector: 'Engenharia', shift: 'Administrativo', pin: '1313', email: 'eduardo@roboflex.com.br', positionId: 'pos-eng', active: true },
      { id: 'u14', name: 'Patrícia Melo', role: 'Financeiro', sector: 'Financeiro', shift: 'Administrativo', pin: '1414', email: 'patricia@roboflex.com.br', positionId: 'pos-fin', active: true },
      { id: 'u15', name: 'André Silva', role: 'Assistência', sector: 'Assistência técnica', shift: 'Administrativo', pin: '1515', email: 'andre@roboflex.com.br', positionId: 'pos-ast', active: true },
      { id: 'u2', name: 'Paulo Mendes', role: 'PCP', sector: 'Planejamento', shift: 'Administrativo', pin: '2222' },
      { id: 'u3', name: 'Juliana Reis', role: 'Compras', sector: 'Suprimentos', shift: 'Administrativo', pin: '3333', positionId: 'pos-compras' },
      { id: 'u4', name: 'Carlos Lima', role: 'Almoxarifado', sector: 'Almoxarifado', shift: 'Manhã', pin: '4444' },
      { id: 'u5', name: 'Bruno Alves', role: 'Líder de produção', sector: 'Produção', shift: 'Manhã', pin: '5555', positionId: 'pos-lider' },
      { id: 'u6', name: 'João Pereira', role: 'Operador', sector: 'Injeção', shift: 'Manhã', pin: '1234', positionId: 'pos-op' },
      { id: 'u7', name: 'Ana Costa', role: 'Operador', sector: 'Montagem', shift: 'Manhã', pin: '1234' },
      { id: 'u8', name: 'Lucas Ferreira', role: 'Operador', sector: 'Injeção', shift: 'Tarde', pin: '1234' },
      { id: 'u9', name: 'Fernanda Rocha', role: 'Qualidade', sector: 'Qualidade', shift: 'Manhã', pin: '6666' },
      { id: 'u10', name: 'Rafael Souza', role: 'Expedição', sector: 'Logística', shift: 'Manhã', pin: '7777' },
      { id: 'u11', name: 'Diego Martins', role: 'Manutenção', sector: 'Manutenção', shift: 'Manhã', pin: '8888', email: 'diego.martins@roboflex.com.br', positionId: 'pos-manut' },
      { id: 'u17', name: 'Sérgio Prado', role: 'Operador', sector: 'Injeção', shift: 'Tarde', pin: '1717', email: 'sergio.prado@roboflex.com.br', positionId: 'pos-op', active: true },
      { id: 'u18', name: 'Helena Duarte', role: 'Engenharia', sector: 'Engenharia Zontec', shift: 'Administrativo', pin: '1818', email: 'helena.duarte@zontec.com.br', positionId: 'pos-z-eng', active: true, homeTenantId: 'tenant-roboflex-sul' },
    ],
    sectors: [
      { id: 'sec-dir', tenantId: 'tenant-roboflex', name: 'Diretoria industrial', managerPositionId: 'pos-dir', managerId: 'u16' },
      { id: 'sec-com', tenantId: 'tenant-roboflex', name: 'Comercial', managerPositionId: 'pos-com', managerId: 'u12', parentId: 'sec-dir' },
      { id: 'sec-eng', tenantId: 'tenant-roboflex', name: 'Engenharia', managerPositionId: 'pos-eng', managerId: 'u13', parentId: 'sec-dir' },
      { id: 'sec-sup', tenantId: 'tenant-roboflex', name: 'Suprimentos', managerPositionId: 'pos-compras', managerId: 'u3', parentId: 'sec-dir' },
      { id: 'sec-pro', tenantId: 'tenant-roboflex', name: 'Operações', managerPositionId: 'pos-lider', managerId: 'u5', parentId: 'sec-dir' },
      { id: 'sec-ser', tenantId: 'tenant-roboflex', name: 'Serviços', managerPositionId: 'pos-manut', managerId: 'u11', parentId: 'sec-dir' },
      { id: 'sec-fin', tenantId: 'tenant-roboflex', name: 'Financeiro', managerPositionId: 'pos-fin', managerId: 'u14', parentId: 'sec-dir' },
      { id: 'sec-z-dir', tenantId: 'tenant-roboflex-sul', name: 'Diretoria Zontec' },
      { id: 'sec-z-eng', tenantId: 'tenant-roboflex-sul', name: 'Engenharia Zontec', managerPositionId: 'pos-z-eng', managerId: 'u18', parentId: 'sec-z-dir' },
    ],
    jobs: [
      { id: 'job-com', tenantId: 'tenant-roboflex', name: 'Executiva comercial', level: 'Pleno', cbo: '2532-25', mission: 'CRM, propostas e carteira de clientes', requirements: ['Proposta comercial'], status: 'Ativo' },
      { id: 'job-eng', tenantId: 'tenant-roboflex', name: 'Engenheiro de produto', level: 'Pleno', cbo: '2144-05', mission: 'Produto, estrutura, roteiro e revisão', requirements: ['Desenho técnico'], status: 'Ativo' },
      { id: 'job-fin', tenantId: 'tenant-roboflex', name: 'Analista financeiro', level: 'Pleno', cbo: '2522-10', mission: 'Orçamentos e acompanhamento', requirements: ['Acompanhamento orçamentário'], status: 'Ativo' },
      { id: 'job-ast', tenantId: 'tenant-roboflex', name: 'Técnico de campo', level: 'Pleno', cbo: '3131-15', mission: 'Triagem e execução de assistência', requirements: ['Atendimento em campo'], status: 'Ativo' },
      { id: 'job-dir', tenantId: 'tenant-roboflex', name: 'Diretor industrial', level: 'Diretoria', cbo: '1223-05', mission: 'Responder pela operação e pelas áreas de apoio', requirements: ['Gestão industrial'], status: 'Ativo' },
      { id: 'job-op', tenantId: 'tenant-roboflex', name: 'Operador industrial', level: 'Operacional', cbo: '7842-05', mission: 'Apontamento e autocontrole', requirements: ['Injeção'], status: 'Ativo' },
      { id: 'job-compras', tenantId: 'tenant-roboflex', name: 'Comprador', level: 'Pleno', cbo: '3542-05', mission: 'Cotações e pedidos de compra', requirements: ['Cotação'], status: 'Ativo' },
      { id: 'job-lider', tenantId: 'tenant-roboflex', name: 'Líder de produção', level: 'Liderança', cbo: '7601-05', mission: 'Conduzir a operação do turno', requirements: ['Liderança de célula'], status: 'Ativo' },
      { id: 'job-manut', tenantId: 'tenant-roboflex', name: 'Técnico de manutenção', level: 'Pleno', cbo: '9113-05', mission: 'Disponibilidade das máquinas', requirements: ['Manutenção industrial'], status: 'Ativo' },
      { id: 'job-z-eng', tenantId: 'tenant-roboflex-sul', name: 'Engenheiro de produto', level: 'Pleno', cbo: '2144-05', mission: 'Apoio de engenharia da Zontec', requirements: ['Processo de injeção'], status: 'Ativo' },
    ],
    positions: [
      { id: 'pos-com', tenantId: 'tenant-roboflex', name: 'Executiva comercial', sectorId: 'sec-com', jobId: 'job-com', description: 'CRM, propostas e carteira de clientes', headcount: 1, status: 'Ativo' },
      { id: 'pos-eng', tenantId: 'tenant-roboflex', name: 'Engenheiro de produto', sectorId: 'sec-eng', jobId: 'job-eng', description: 'Produto, estrutura, roteiro e revisão', headcount: 1, status: 'Ativo' },
      { id: 'pos-fin', tenantId: 'tenant-roboflex', name: 'Analista financeiro', sectorId: 'sec-fin', jobId: 'job-fin', description: 'Orçamentos e acompanhamento', headcount: 1, status: 'Ativo' },
      { id: 'pos-ast', tenantId: 'tenant-roboflex', name: 'Técnico de campo', sectorId: 'sec-ser', jobId: 'job-ast', description: 'Triagem e execução de assistência', headcount: 1, status: 'Ativo' },
      { id: 'pos-op', tenantId: 'tenant-roboflex', name: 'Operador industrial', sectorId: 'sec-pro', jobId: 'job-op', description: 'Apontamento e autocontrole', parentPositionId: 'pos-lider', headcount: 6, status: 'Ativo' },
      { id: 'pos-compras', tenantId: 'tenant-roboflex', name: 'Comprador', sectorId: 'sec-sup', jobId: 'job-compras', description: 'Cotações e pedidos de compra', headcount: 1, status: 'Ativo' },
      { id: 'pos-dir', tenantId: 'tenant-roboflex', name: 'Diretor industrial', sectorId: 'sec-dir', jobId: 'job-dir', description: 'Responder pela operação e pelas áreas de apoio', headcount: 1, status: 'Ativo' },
      { id: 'pos-lider', tenantId: 'tenant-roboflex', name: 'Líder de produção', sectorId: 'sec-pro', jobId: 'job-lider', description: 'Conduzir a operação do turno', headcount: 1, status: 'Ativo' },
      { id: 'pos-manut', tenantId: 'tenant-roboflex', name: 'Técnico de manutenção', sectorId: 'sec-ser', jobId: 'job-manut', description: 'Disponibilidade das máquinas', headcount: 1, status: 'Ativo' },
      { id: 'pos-z-eng', tenantId: 'tenant-roboflex-sul', name: 'Engenheiro de produto', sectorId: 'sec-z-eng', jobId: 'job-z-eng', description: 'Apoio de engenharia da Zontec', headcount: 2, status: 'Ativo' },
    ],
    supplierHomologations: [],
    partners: [
      bp({ id: 'c1', name: 'Mineradora Horizonte', document: '12.345.678/0001-10', roles: ['Cliente'], city: 'Itabira, MG', contact: 'Marcelo Dias', email: 'marcelo.dias@cliente.com', vertical: 'Mineração', abcClass: 'A', abcDecidedBy: 'Camila Nunes', abcDecidedAt: '2026-01-15T12:00:00.000Z', contacts: [{ name: 'Marcelo Dias', duty: 'Operação', phone: '(31) 98800-1200', email: 'marcelo.dias@cliente.com' }, { name: 'Ana Ribeiro', duty: 'Compras', phone: '(31) 98800-1210', email: 'ana.ribeiro@cliente.com' }] }),
      bp({ id: 'c2', name: 'Translog Brasil', document: '23.456.789/0001-20', roles: ['Cliente', 'Transportadora'], city: 'Contagem, MG', contact: 'Bianca Alves', email: 'bianca@translog.com.br', vertical: 'Logística' }),
      bp({ id: 't1', name: 'Rodonaves', document: '81.111.111/0001-81', roles: ['Transportadora'], city: 'Ribeirão Preto, SP', contact: 'Paulo Vieira', email: 'paulo@rodonaves.com.br' }),
      bp({ id: 't2', name: 'Braspress', document: '82.222.222/0001-82', roles: ['Transportadora'], city: 'Guarulhos, SP', contact: 'Sandra Melo', email: 'sandra@braspress.com.br' }),
      bp({ id: 'c3', name: 'Agro Vale Verde', document: '34.567.890/0001-30', roles: ['Cliente'], city: 'Rio Verde, GO', contact: 'Rui Prado', email: 'rui@agrovale.com.br', vertical: 'Agro' }),
      bp({ id: 'c4', name: 'Hotel Serra Azul', document: '45.678.901/0001-40', roles: ['Cliente'], city: 'Gramado, RS', contact: 'Lívia Costa', email: 'livia@serraazul.com.br', vertical: 'Varejo' }),
      bp({ id: 'c5', name: 'Porto Leste', document: '56.789.012/0001-50', roles: ['Cliente'], city: 'Vitória, ES', contact: 'Fábio Luz', email: 'fabio@portoleste.com.br', vertical: 'Logística' }),
      bp({ id: 'c6', name: 'Rede Varejo Prime', document: '67.890.123/0001-60', roles: ['Cliente'], city: 'São Paulo, SP', contact: 'Nina Lopes', email: 'nina@varejoprime.com.br', vertical: 'Varejo' }),
      bp({ id: 'f1', name: 'Polímeros Minas', document: '71.111.111/0001-11', roles: ['Fornecedor'], city: 'Betim, MG', contact: 'César Mota', email: 'vendas@polimerosminas.com.br' }),
      bp({ id: 'f2', name: 'TecnoPoli', document: '72.222.222/0001-22', roles: ['Fornecedor'], city: 'Campinas, SP', contact: 'Bia Lima', email: 'bia@tecnopoli.com.br' }),
      bp({ id: 'f3', name: 'EletroSul Componentes', document: '73.333.333/0001-33', roles: ['Fornecedor'], city: 'Joinville, SC', contact: 'Luiz Reis', email: 'luiz@eletrosul.com.br' }),
      bp({
        id: 'p-norte', name: 'Oficina Norte', legalName: 'Oficina Norte Ltda', tradeName: 'Oficina Norte', document: '08.444.555/0001-66', roles: ['Cliente', 'Fornecedor'], city: 'Sabará, MG', contact: 'Helena Prado', email: 'helena@oficinanorte.com.br', vertical: 'Indústria',
        contacts: [{ name: 'Helena Prado', duty: 'Comercial', phone: '31 3333-1000', email: 'helena@oficinanorte.com.br' }, { name: 'Ivo Prado', duty: 'Financeiro', phone: '31 3333-1001', email: 'ivo@oficinanorte.com.br' }],
        addresses: [{ purpose: 'Sede', line: 'Rua do Comércio, 40', city: 'Sabará', state: 'MG' }, { purpose: 'Entrega', line: 'Rua do Comércio, 40', city: 'Sabará', state: 'MG' }],
      }),
    ],
    productRevisions: [
      { id: 'rev-a11-c', itemId: 'pa-a11-ext', code: 'C', status: 'Liberada', createdAt: '2026-08-02T10:00:00.000Z', releasedAt: '2026-08-10T14:00:00.000Z', releasedBy: 'Eduardo Freitas', checklist: [{ label: 'Cadastro', done: true }, { label: 'Estrutura', done: true }, { label: 'Roteiro', done: true }, { label: 'Fiscal', done: true }], notes: 'Reforço do alojamento do conector.' },
      { id: 'rev-a11-d', itemId: 'pa-a11-ext', code: 'D', status: 'Rascunho', createdAt: '2026-10-13T10:00:00.000Z', checklist: [{ label: 'Cadastro', done: true }, { label: 'Estrutura', done: true }, { label: 'Roteiro', done: false }, { label: 'Fiscal', done: true }], notes: 'Nova vedação para uso portuário.' },
      { id: 'rev-impact-b', itemId: 'pa-a11-imp', code: 'B', status: 'Liberada', createdAt: '2026-07-01T10:00:00.000Z', releasedAt: '2026-07-09T10:00:00.000Z', releasedBy: 'Eduardo Freitas', checklist: [{ label: 'Cadastro', done: true }, { label: 'Estrutura', done: true }, { label: 'Roteiro', done: true }], notes: 'Versão vigente.' },
    ],
    engineeringChanges: [],
    services: [
      { id: 'sv-mont', tenantId: 'tenant-roboflex', code: 'SV-PRO-001', name: 'Montagem mecânica de case', unit: 'hora', status: 'Ativo', sellable: false, usableInServiceOrder: false, usableInRouting: true, place: 'Roboflex', executor: 'Própria', sectorId: 'sec-pro', teamLabel: 'Montagem', estimatedMinutes: 60, cost: 52, price: 0, instructions: [{ version: 1, text: 'Montar o case na sequência do roteiro e conferir o encaixe no gabarito.', author: 'Carga inicial', createdAt: '2026-08-01T12:00:00.000Z', origin: 'Carga inicial' }] },
      { id: 'sv-prev', tenantId: 'tenant-roboflex', code: 'SV-MAN-002', name: 'Preventiva em injetora', unit: 'hora', status: 'Ativo', sellable: false, usableInServiceOrder: true, usableInRouting: false, place: 'Roboflex', executor: 'Própria', sectorId: 'sec-ser', teamLabel: 'Manutenção', estimatedMinutes: 180, cost: 95, price: 0, instructions: [{ version: 1, text: 'Executar o plano preventivo da injetora e registrar o que foi encontrado.', author: 'Carga inicial', createdAt: '2026-08-01T12:00:00.000Z', origin: 'Carga inicial' }] },
      { id: 'sv-campo', tenantId: 'tenant-roboflex', code: 'SV-AST-003', name: 'Visita técnica em campo', unit: 'visita', status: 'Ativo', sellable: true, usableInServiceOrder: true, usableInRouting: false, place: 'Cliente', executor: 'Própria', sectorId: 'sec-ser', teamLabel: 'Assistência', estimatedMinutes: 240, cost: 320, price: 480, instructions: [{ version: 1, text: 'Atender no cliente, testar o produto e registrar o relatório da visita.', author: 'Carga inicial', createdAt: '2026-08-01T12:00:00.000Z', origin: 'Carga inicial' }] },
      { id: 'sv-lab', tenantId: 'tenant-roboflex', code: 'SV-TER-004', name: 'Ensaio IP65 em laboratório', unit: 'un', status: 'Ativo', sellable: true, usableInServiceOrder: false, usableInRouting: false, place: 'Outro', executor: 'Terceirizado', datasheetName: 'IP65-datasheet.pdf', supplierId: 'f3', cost: 850, price: 1200, instructions: [] },
    ],
    demands: [
      { id: 'DM-104', kind: 'Material', itemId: 'mp-tpu', description: 'TPU para OP urgente', quantity: 38, origin: 'OP', originId: 'OP-24035', neededBy: '2026-10-18', priority: 'Urgente', status: 'Em atendimento', assigneeRole: 'Compras', requester: 'u5', purchaseOrderId: 'PC-7310', supplierId: 'f2', estimatedCost: 1660, notes: 'Sem TPU a OP de montagem para no dia 18.', createdAt: '2026-10-15T07:30:00.000Z' },
      { id: 'DM-103', kind: 'Serviço', serviceId: 'sv-lab', description: 'Ensaio externo do projeto Mining S10', quantity: 1, origin: 'Projeto', originId: 'PRJ-26-014', neededBy: '2026-10-24', priority: 'Alta', status: 'Em atendimento', assigneeRole: 'Compras', requester: 'u13', projectId: 'PRJ-26-014', supplierId: 'f3', estimatedCost: 850, notes: 'Laboratório credenciado; ensaio IP65 com 6 amostras do protótipo.', createdAt: '2026-10-14T13:00:00.000Z' },
      { id: 'DM-102', kind: 'Material', itemId: 'cp-placa', description: 'Placa para assistência em garantia', quantity: 2, origin: 'Assistência', originId: 'AT-26018', neededBy: '2026-10-17', priority: 'Alta', status: 'Aberta', assigneeRole: 'Almoxarifado', requester: 'u15', estimatedCost: 64, createdAt: '2026-10-15T08:20:00.000Z' },
      { id: 'DM-105', kind: 'Serviço', serviceId: 'sv-prev', description: 'Revisão do cilindro da Injetora 03', quantity: 100, origin: 'Manutenção', neededBy: '2026-10-28', priority: 'Alta', status: 'Aberta', assigneeRole: 'Compras', requester: 'u11', estimatedCost: 9500, budgetCategoryId: 'BC-OPER', budgetPeriod: '2026-10', createdAt: '2026-10-18T09:00:00.000Z' },
      { id: 'DM-106', kind: 'Material', itemId: 'mp-abs', description: 'Baixa de lote reprovado na inspeção', quantity: 1, origin: 'Manual', neededBy: '2026-10-20', priority: 'Alta', status: 'Aberta', assigneeRole: 'Qualidade', requester: 'u11', estimatedCost: 150000, budgetCategoryId: 'BC-PERDAS', budgetPeriod: '2026-10', createdAt: '2026-10-19T09:00:00.000Z' },
      { id: 'DM-107', kind: 'Material', itemId: 'cp-cabo', description: 'Cabo para o protótipo do pátio', quantity: 4, origin: 'Oportunidade', originId: 'OPP-26043', neededBy: '2026-11-05', priority: 'Normal', status: 'Aberta', assigneeRole: 'Compras', requester: 'u12', estimatedCost: 56, createdAt: '2026-10-16T15:00:00.000Z' },
    ],
    purchaseOrders: [
      { id: 'PC-7310', supplierId: 'f2', demandIds: ['DM-104'], itemId: 'mp-tpu', quantity: 40, received: 20, unitPrice: 41.5, promisedDate: '2026-10-17', status: 'Recebido parcial', quotes: [{ supplierId: 'f2', unitPrice: 41.5, leadDays: 2, selected: true }, { supplierId: 'f1', unitPrice: 39.8, leadDays: 7, selected: false }], budgetId: 'ORC-MAT-10', createdAt: '2026-10-14T14:00:00.000Z' },
    ],
    opportunities: [
      { id: 'OPP-26042', tenantId: 'tenant-roboflex', partnerId: 'c1', title: 'Renovação tablets mina Norte', ownerId: 'u12', stage: 'Proposta', temperature: 'Quente', value: 102194, mrr: 8500, probability: 55, statusNote: 'Proposta enviada, cliente revisa a entrega antes da parada.', nextAction: 'Revisar condição de entrega', expectedClose: '2026-10-22', source: 'Indicação', contact: 'Marcelo Dias', phone: '(31) 98800-1200', email: 'marcelo.dias@cliente.com', segment: 'Mineração', dealType: 'Venda', itemIds: ['pa-s9-min', 'pa-a11-ext'], quantity: 144, createdAt: '2026-09-22T10:00:00.000Z', notes: 'Troca de 120 tablets na mina Norte e 24 na usina. Cliente exige IP68 e entrega antes da parada de dezembro.', observation: '<p>Cliente quer a troca antes da parada de dezembro. O concorrente ofereceu prazo maior, sem o IP68.</p><ul><li>120 tablets na mina Norte</li><li>24 na usina</li></ul>', activities: [{ id: 'act-1', at: '2026-10-15T09:00:00.000Z', type: 'Reunião', text: 'Validação técnica com operação', done: true }] },
      { id: 'OPP-26043', tenantId: 'tenant-roboflex', partnerId: 'c5', title: 'Cases para coletores do pátio', ownerId: 'u12', stage: 'Elaboração', temperature: 'Morno', value: 62400, mrr: 4200, probability: 40, nextAction: 'Apresentar protótipo', expectedClose: '2026-10-29', source: 'Site', contact: 'Fábio Luz', segment: 'Logística', dealType: 'Venda', itemIds: ['pa-a11-ext'], quantity: 60, createdAt: '2026-10-06T15:00:00.000Z', activities: [{ id: 'act-2', at: '2026-10-16T13:00:00.000Z', type: 'Tarefa', text: 'Enviar desenho da fixação', done: false }] },
      { id: 'OPP-26044', tenantId: 'tenant-roboflex', partnerId: 'c2', title: 'Prospecção frota leve', ownerId: 'u12', stage: 'Prospecção', temperature: 'Frio', value: 28000, mrr: 1800, probability: 10, nextAction: 'Retornar ligação', expectedClose: '2026-12-15', source: 'Prospecção Passiva', contact: 'Bianca Alves', segment: 'Logística', dealType: 'Venda', itemIds: ['pa-lite-ipad'], quantity: 40, createdAt: '2026-10-20T11:00:00.000Z', activities: [] },
      { id: 'OPP-26045', tenantId: 'tenant-roboflex', partnerId: 'c1', title: 'Novo case para coletor portuário', ownerId: 'u12', stage: 'Desenvolvimento', temperature: 'Quente', value: 180000, mrr: 12000, probability: 25, statusNote: 'Cliente pediu vedação nova. PAP com a engenharia.', nextAction: 'Acompanhar a mudança de engenharia', expectedClose: '2026-11-30', source: 'Feira e Eventos', contact: 'Marcelo Dias', segment: 'Mineração', dealType: 'Venda', quantity: 200, createdAt: '2026-10-08T09:00:00.000Z', notes: 'Produto ainda não existe. A engenharia abre a estrutura depois do PAP.', activities: [] },
      { id: 'OPP-26040', tenantId: 'tenant-roboflex', partnerId: 'c2', title: 'Padronização frota 2027', ownerId: 'u12', stage: 'Conquista', temperature: 'Quente', value: 49600, mrr: 3100, probability: 100, nextAction: 'Acompanhar primeiro lote', expectedClose: '2026-10-10', wonAt: '2026-10-10', source: 'Carteira', contact: 'Bianca Alves', segment: 'Logística', dealType: 'Venda', itemIds: ['pa-a11-ext'], quantity: 80, createdAt: '2026-09-10T09:00:00.000Z', activities: [] },
      { id: 'OPP-26039', tenantId: 'tenant-roboflex', partnerId: 'c5', title: 'Cases da safra anterior', ownerId: 'u12', stage: 'Perdida', temperature: 'Frio', value: 22000, mrr: 0, probability: 0, lossReason: 'Preço', nextAction: '—', expectedClose: '2026-09-30', source: 'Indicação', contact: 'Fábio Luz', segment: 'Logística', dealType: 'Venda', createdAt: '2026-08-12T09:00:00.000Z', activities: [] },
      { id: 'OPP-26046', tenantId: 'tenant-roboflex-sul', partnerId: 'c2', title: 'Zontec · mesas para a linha leve', ownerId: 'u18', stage: 'Prospecção', temperature: 'Morno', value: 36000, mrr: 2400, probability: 10, nextAction: 'Visita na planta', expectedClose: '2026-11-20', source: 'Prospecção Ativa', contact: 'Helena Duarte', segment: 'Indústria', dealType: 'Venda', itemIds: ['pa-lite-ipad'], quantity: 30, createdAt: '2026-10-18T14:00:00.000Z', activities: [] },
    ],
    salesGoals: [
      { tenantId: 'tenant-roboflex', year: 2026, amount: 40000000 },
      { tenantId: 'tenant-roboflex-sul', year: 2026, amount: 8000000 },
    ],
    proposals: [
      { id: 'PROP-26018', opportunityId: 'OPP-26042', partnerId: 'c1', lines: [{ itemId: 'pa-s9-min', description: 'Case Mining · Galaxy Tab S9 FE', quantity: 120, unitPrice: 745 }, { itemId: 'pa-a11-ext', description: 'Case Extreme · Samsung Tab A11', quantity: 24, unitPrice: 520 }, { serviceId: 'sv-campo', description: 'Implantação em campo', quantity: 2, unitPrice: 1200 }], discount: 2, paymentTerms: '28/56 dias', validUntil: '2026-10-25', suggestedDate: '2026-11-28', status: 'Enviada', createdAt: '2026-10-13T14:00:00.000Z' },
      { id: 'PROP-26019', opportunityId: 'OPP-26043', partnerId: 'c5', lines: [{ itemId: 'pa-a11-ext', description: 'Case Extreme · Samsung Tab A11', quantity: 60, unitPrice: 520 }], discount: 0, paymentTerms: '28 dias', validUntil: '2026-11-02', suggestedDate: '2026-11-20', status: 'Rascunho', createdAt: '2026-10-15T10:00:00.000Z' },
    ],
    technicalServiceOrders: [
      { id: 'AT-26018', partnerId: 'c2', salesOrderId: 'PV-2026-1033', productionOrderId: 'OP-24031', assetSerial: 'RF26-001842', description: 'Conector de carga intermitente em duas unidades', warranty: true, chargeable: false, technicianId: 'u15', scheduledFor: '2026-10-16', status: 'Agendada', usedItemIds: [], channel: 'Telefone', contact: 'Bianca Alves', diagnosis: 'Placa do conector com solda fria; trocar a placa nas duas unidades.', parts: [{ itemId: 'cp-placa', quantity: 2, consumed: false }], demandIds: ['DM-102'], createdAt: '2026-10-15T08:00:00.000Z' },
      { id: 'AT-26017', partnerId: 'c4', salesOrderId: 'PV-2026-1041', description: 'Avaliar suporte com folga após queda', warranty: false, chargeable: true, status: 'Aberta', usedItemIds: [], channel: 'E-mail', contact: 'Lívia Costa', parts: [], createdAt: '2026-10-14T16:20:00.000Z' },
    ],
    projects: [
      { id: 'PRJ-26-014', name: 'Case Mining Galaxy Tab S10', kind: 'Produto novo', ownerId: 'u13', partnerId: 'c1', status: 'Em andamento', startDate: '2026-09-15', endDate: '2026-12-18', budgetId: 'ORC-PD-10', itemId: 'pa-s9-min', opportunityId: 'OPP-26042', memberIds: ['u13', 'u12', 'u5'], description: 'Nova versão do case Mining para o Galaxy Tab S10, puxada pela renovação da mina Norte. Reaproveita a borda do S9 e muda o encaixe da câmera.', risks: ['Ensaio IP65 depende de laboratório externo', 'Molde da tampa precisa de ajuste de 0,3 mm'], milestones: [{ id: 'm1', title: 'Requisitos aprovados', dueDate: '2026-09-30', done: true, doneAt: '2026-09-29' }, { id: 'm2', title: 'Protótipo funcional', dueDate: '2026-10-25', done: false }, { id: 'm3', title: 'Validação em campo', dueDate: '2026-11-20', done: false }] },
      { id: 'PRJ-26-011', name: 'Redução de setup molde A11', kind: 'Melhoria', ownerId: 'u5', memberIds: ['u5', 'u11'], description: 'Reduzir de 55 para 30 minutos a troca do molde do Tab A11 na Injetora 02.', status: 'Planejado', startDate: '2026-10-20', endDate: '2026-11-28', milestones: [{ id: 'm4', title: 'Medição do setup atual', dueDate: '2026-10-22', done: false }, { id: 'm5', title: 'Novo carrinho de troca', dueDate: '2026-11-10', done: false }] },
    ],
    budgetGroups: [],
    budgetCategories: [
      { id: 'BC-ROB', tenantId: 'tenant-roboflex', code: '01.01', name: 'Receita Bruta de Vendas', group: '01. Receita Operacional Bruta', status: 'Ativa', nature: 'Receita', audit: [] },
      { id: 'BC-CMV', tenantId: 'tenant-roboflex', code: '03.01', name: 'Custo Mercadoria Vendida', group: '03. Custos', status: 'Ativa', audit: [] },
      { id: 'BC-CMV-1', tenantId: 'tenant-roboflex', code: '03.01.01', name: 'Compras de Matéria Prima', group: '03. Custos', parentId: 'BC-CMV', status: 'Ativa', responsibleUserId: 'u3', executorSectorId: 'sec-sup', audit: [] },
      { id: 'BC-CMV-2', tenantId: 'tenant-roboflex', code: '03.01.02', name: 'Compra de Serviços Terceirizados', group: '03. Custos', parentId: 'BC-CMV', status: 'Ativa', responsibleUserId: 'u3', executorSectorId: 'sec-sup', audit: [] },
      { id: 'BC-CMV-3', tenantId: 'tenant-roboflex', code: '03.01.03', name: 'Compras de Mercadorias para Revenda', group: '03. Custos', parentId: 'BC-CMV', status: 'Ativa', audit: [] },
      { id: 'BC-CMV-4', tenantId: 'tenant-roboflex', code: '03.01.04', name: 'Embalagens', group: '03. Custos', parentId: 'BC-CMV', status: 'Ativa', audit: [] },
      { id: 'BC-CMV-5', tenantId: 'tenant-roboflex', code: '03.01.05', name: 'Materiais e Insumos para SaaS', group: '03. Custos', parentId: 'BC-CMV', status: 'Ativa', audit: [] },
      { id: 'BC-OPER', tenantId: 'tenant-roboflex', code: '03.02', name: 'Custo Operacional', group: '03. Custos', status: 'Ativa', responsibleUserId: 'u5', executorSectorId: 'sec-pro', audit: [] },
      { id: 'BC-DEPREC', tenantId: 'tenant-roboflex', code: '03.03', name: 'Custo Máquinas - Depreciação', group: '03. Custos', status: 'Ativa', audit: [] },
      { id: 'BC-PESSOAL', tenantId: 'tenant-roboflex', code: '03.04', name: 'Custo de Pessoal', group: '03. Custos', status: 'Ativa', audit: [] },
      { id: 'BC-VENDAS', tenantId: 'tenant-roboflex', code: '03.05', name: 'Custo com Vendas e Marketing', group: '03. Custos', status: 'Ativa', audit: [] },
      { id: 'BC-PD', tenantId: 'tenant-roboflex', code: '03.06', name: 'Custo com Pesquisa e Desenvolvimento', group: '03. Custos', status: 'Ativa', responsibleUserId: 'u13', executorSectorId: 'sec-eng', audit: [] },
      { id: 'BC-MAT-PD', tenantId: 'tenant-roboflex', code: '03.07', name: 'Materiais Pesquisa e Desenvolvimento', group: '03. Custos', status: 'Ativa', audit: [] },
      { id: 'BC-GARANTIA', tenantId: 'tenant-roboflex', code: '03.08', name: 'Custo com Garantia e Perdas', group: '03. Custos', status: 'Ativa', responsibleUserId: 'u11', executorSectorId: 'sec-ser', audit: [] },
      { id: 'BC-PERDAS', tenantId: 'tenant-roboflex', code: '03.09', name: 'Perdas', group: '03. Custos', status: 'Ativa', responsibleUserId: 'u14', executorSectorId: 'sec-fin', audit: [] },
      { id: 'BC-IMPOSTOS', tenantId: 'tenant-roboflex', code: '02.01', name: 'Impostos e Taxas', group: '02. Deduções da Receita', status: 'Ativa', audit: [] },
      { id: 'BC-DEVOL', tenantId: 'tenant-roboflex', code: '02.02', name: 'Devoluções e Reembolsos', group: '02. Deduções da Receita', status: 'Ativa', audit: [] },
      { id: 'BC-CAPEX', tenantId: 'tenant-roboflex', code: '09.01', name: 'Máquinas e Moldes', group: '09. Investimentos (CAPEX)', status: 'Ativa', isCapex: true, responsibleUserId: 'u13', executorSectorId: 'sec-pro', audit: [] },
      // Empresa-irmã (tenant-roboflex-sul), árvore mínima só para o planejamento de grupo ter o que combinar.
      { id: 'BC-ROB-SUL', tenantId: 'tenant-roboflex-sul', code: '01.01', name: 'Receita Bruta de Vendas', group: '01. Receita Operacional Bruta', status: 'Ativa', nature: 'Receita', audit: [] },
      { id: 'BC-CMV-SUL', tenantId: 'tenant-roboflex-sul', code: '03.01', name: 'Custo Mercadoria Vendida', group: '03. Custos', status: 'Ativa', audit: [] },
    ],
    budgets: [
      { id: 'ORC-ROB-10', tenantId: 'tenant-roboflex', categoryId: 'BC-ROB', period: '2026', amount: 48000000, alertThreshold: 80, blockOnOverrun: false, audit: [] },
      { id: 'ORC-CMV-10', tenantId: 'tenant-roboflex', categoryId: 'BC-CMV', period: '2026', amount: 2160000, alertThreshold: 80, blockOnOverrun: true, audit: [] },
      { id: 'ORC-CMV-1', tenantId: 'tenant-roboflex', categoryId: 'BC-CMV-1', period: '2026', amount: 432000, alertThreshold: 80, blockOnOverrun: true, audit: [], sectorAllocations: [{ sectorId: 'sec-sup', amount: 432000 }] },
      { id: 'ORC-CMV-2', tenantId: 'tenant-roboflex', categoryId: 'BC-CMV-2', period: '2026', amount: 432000, alertThreshold: 80, blockOnOverrun: true, audit: [], sectorAllocations: [{ sectorId: 'sec-sup', amount: 400000 }] },
      { id: 'ORC-CMV-3', tenantId: 'tenant-roboflex', categoryId: 'BC-CMV-3', period: '2026', amount: 432000, alertThreshold: 80, blockOnOverrun: true, audit: [] },
      { id: 'ORC-CMV-4', tenantId: 'tenant-roboflex', categoryId: 'BC-CMV-4', period: '2026', amount: 432000, alertThreshold: 80, blockOnOverrun: true, audit: [] },
      { id: 'ORC-CMV-5', tenantId: 'tenant-roboflex', categoryId: 'BC-CMV-5', period: '2026', amount: 432000, alertThreshold: 80, blockOnOverrun: true, audit: [] },
      { id: 'ORC-OPER-10', tenantId: 'tenant-roboflex', categoryId: 'BC-OPER', period: '2026', amount: 384000, alertThreshold: 80, blockOnOverrun: true, audit: [], sectorAllocations: [{ sectorId: 'sec-pro', amount: 230400 }, { sectorId: 'sec-eng', amount: 96000 }, { sectorId: 'sec-sup', amount: 57600 }] },
      { id: 'ORC-PD-10', tenantId: 'tenant-roboflex', categoryId: 'BC-PD', period: '2026', amount: 1440000, alertThreshold: 80, blockOnOverrun: true, audit: [], sectorAllocations: [{ sectorId: 'sec-eng', amount: 864000 }, { sectorId: 'sec-pro', amount: 576000 }] },
      { id: 'ORC-GAR-10', tenantId: 'tenant-roboflex', categoryId: 'BC-GARANTIA', period: '2026', amount: 264000, alertThreshold: 80, blockOnOverrun: false, audit: [], sectorAllocations: [{ sectorId: 'sec-ser', amount: 264000 }] },
      { id: 'ORC-PERDAS-10', tenantId: 'tenant-roboflex', categoryId: 'BC-PERDAS', period: '2026', amount: 144000, alertThreshold: 75, blockOnOverrun: true, audit: [] },
      { id: 'ORC-CAPEX-10', tenantId: 'tenant-roboflex', categoryId: 'BC-CAPEX', period: '2026', amount: 600000, alertThreshold: 80, blockOnOverrun: false, audit: [], sectorAllocations: [{ sectorId: 'sec-pro', amount: 420000 }, { sectorId: 'sec-eng', amount: 180000 }] },
      { id: 'ORC-ROB-SUL-10', tenantId: 'tenant-roboflex-sul', categoryId: 'BC-ROB-SUL', period: '2026', amount: 18000000, alertThreshold: 80, blockOnOverrun: false, audit: [] },
      { id: 'ORC-CMV-SUL-10', tenantId: 'tenant-roboflex-sul', categoryId: 'BC-CMV-SUL', period: '2026', amount: 820000, alertThreshold: 80, blockOnOverrun: true, audit: [] },
    ],
    budgetEntries: [
      { id: 'BL-1', tenantId: 'tenant-roboflex', kind: 'Previsão', categoryId: 'BC-CMV-1', period: '2026-10', amount: 22000, openAmount: 22000, status: 'Ativo', sourceModule: 'Compras', sourceType: 'Pedido de compra', sourceId: 'PC-7310', description: 'TPU antichoque 85A', sectorId: 'sec-sup', createdAt: '2026-10-08T10:00:00.000Z', events: [] },
      { id: 'BL-9', tenantId: 'tenant-roboflex', kind: 'Previsão', categoryId: 'BC-CMV-2', period: '2026-10', amount: 9800, openAmount: 9800, status: 'Ativo', sourceModule: 'Compras', sourceType: 'Pedido de compra', sourceId: 'PC-7314', description: 'Usinagem de insertos', sectorId: 'sec-sup', createdAt: '2026-10-08T11:00:00.000Z', events: [] },
      { id: 'BL-10', tenantId: 'tenant-roboflex', kind: 'Previsão', categoryId: 'BC-CMV-3', period: '2026-10', amount: 8400, openAmount: 8400, status: 'Ativo', sourceModule: 'Compras', sourceType: 'Pedido de compra', sourceId: 'PC-7315', description: 'Acessório para revenda', sectorId: 'sec-sup', createdAt: '2026-10-08T11:20:00.000Z', events: [] },
      { id: 'BL-11', tenantId: 'tenant-roboflex', kind: 'Previsão', categoryId: 'BC-CMV-4', period: '2026-10', amount: 5000, openAmount: 5000, status: 'Ativo', sourceModule: 'Compras', sourceType: 'Pedido de compra', sourceId: 'PC-7316', description: 'Caixas de embarque', sectorId: 'sec-sup', createdAt: '2026-10-08T11:40:00.000Z', events: [] },
      { id: 'BL-12', tenantId: 'tenant-roboflex', kind: 'Previsão', categoryId: 'BC-CMV-5', period: '2026-10', amount: 3000, openAmount: 3000, status: 'Ativo', sourceModule: 'Compras', sourceType: 'Pedido de compra', sourceId: 'PC-7317', description: 'Insumos de identificação', sectorId: 'sec-sup', createdAt: '2026-10-08T12:00:00.000Z', events: [] },
      { id: 'BL-2', tenantId: 'tenant-roboflex', kind: 'Realizado pago', categoryId: 'BC-CMV-1', period: '2026-10', amount: 96740, openAmount: 0, status: 'Liquidado', sourceModule: 'Omie', sourceType: 'Pagamento', sourceId: 'PC-7299', externalId: 'PG-7299-1', invoiceNumber: '7299', linkModule: 'Compras', linkId: 'PC-7299', description: 'NF 7299 · matérias-primas', sectorId: 'sec-sup', createdAt: '2026-10-09T14:00:00.000Z', events: [] },
      { id: 'BL-3', tenantId: 'tenant-roboflex', kind: 'Previsão', categoryId: 'BC-OPER', period: '2026-10', amount: 6800, openAmount: 6800, status: 'Ativo', sourceModule: 'Manutenção', sourceType: 'Ordem de serviço', sourceId: 'OS-1', description: 'Manutenção industrial', sectorId: 'sec-ser', createdAt: '2026-10-10T10:00:00.000Z', events: [] },
      { id: 'BL-4', tenantId: 'tenant-roboflex', kind: 'Realizado pago', categoryId: 'BC-OPER', period: '2026-10', amount: 17450, openAmount: 0, status: 'Liquidado', sourceModule: 'Omie', sourceType: 'Pagamento', sourceId: 'OS-ANT-15', externalId: 'PG-MAN-15', invoiceNumber: '4415', linkModule: 'Manutenção', linkId: 'OS-ANT-15', description: 'NF 4415 · serviços de manutenção', sectorId: 'sec-ser', createdAt: '2026-10-12T10:00:00.000Z', events: [] },
      { id: 'BL-5', tenantId: 'tenant-roboflex', kind: 'Previsão', categoryId: 'BC-PD', period: '2026-10', amount: 28500, openAmount: 28500, status: 'Ativo', sourceModule: 'Projetos', sourceType: 'Projeto', sourceId: 'PRJ-26-014', projectId: 'PRJ-26-014', description: 'Protótipos Case Mining S10', sectorId: 'sec-eng', createdAt: '2026-10-01T10:00:00.000Z', events: [] },
      { id: 'BL-7', tenantId: 'tenant-roboflex', kind: 'Previsão', categoryId: 'BC-OPER', period: '2026-10', amount: 9500, openAmount: 9500, status: 'Ativo', sourceModule: 'Demandas', sourceType: 'Serviço', sourceId: 'DM-105', description: 'Revisão do cilindro da Injetora 03', sectorId: 'sec-ser', createdAt: '2026-10-18T09:00:00.000Z', events: [] },
      { id: 'BL-13', tenantId: 'tenant-roboflex', kind: 'Previsão', categoryId: 'BC-PERDAS', period: '2026-10', amount: 150000, openAmount: 0, heldAmount: 150000, status: 'Retido', sourceModule: 'Demandas', sourceType: 'Material', sourceId: 'DM-106', description: 'Baixa de lote reprovado na inspeção', sectorId: 'sec-ser', createdAt: '2026-10-19T09:00:00.000Z', events: [] },
      { id: 'BL-6', tenantId: 'tenant-roboflex', kind: 'Realizado pago', categoryId: 'BC-PD', period: '2026-10', amount: 41600, openAmount: 0, status: 'Liquidado', sourceModule: 'Omie', sourceType: 'Pagamento', sourceId: 'PRJ-26-014', externalId: 'PG-PD-14', invoiceNumber: '4418', linkModule: 'Projetos', linkId: 'PRJ-26-014', projectId: 'PRJ-26-014', description: 'NF 4418 · ferramental e ensaios', sectorId: 'sec-eng', createdAt: '2026-10-11T10:00:00.000Z', events: [] },
      { id: 'BL-8', tenantId: 'tenant-roboflex', kind: 'Realizado pago', categoryId: 'BC-GARANTIA', period: '2026-10', amount: 890, openAmount: 0, status: 'Liquidado', sourceModule: 'Omie', sourceType: 'Pagamento', sourceId: 'NF-9012', externalId: 'PG-9012', invoiceNumber: '9012', description: 'NF 9012 · serviço avulso', sectorId: 'sec-ser', createdAt: '2026-10-18T16:00:00.000Z', events: [] },
      ...[2900000, 2800000, 3400000, 3500000, 3600000, 3500000, 3600000, 3800000, 3900000, 4000000, 4300000, 4200000].map((amount, index) => {
        const month = String(index + 1).padStart(2, '0')
        return {
          id: `BL-14-${month}`, tenantId: 'tenant-roboflex', kind: 'Realizado recebido' as const, categoryId: 'BC-ROB', period: `2025-${month}`, amount, openAmount: 0, status: 'Liquidado' as const,
          sourceModule: 'Omie' as const, sourceType: 'Recebimento', sourceId: `FAT-2025-${month}`, externalId: `PG-ROB-2025-${month}`, description: `Faturamento de ${month}/2025 · base do planejamento 2026`, createdAt: `2025-${month}-28T18:00:00.000Z`, events: [],
        }
      }),
      { id: 'BL-15', tenantId: 'tenant-roboflex', kind: 'Realizado pago', categoryId: 'BC-CAPEX', period: '2025', amount: 480000, openAmount: 0, status: 'Liquidado', sourceModule: 'Omie', sourceType: 'Pagamento', sourceId: 'CAPEX-2025', externalId: 'PG-CAPEX-2025', description: 'Investimentos em máquinas e moldes de 2025 · base do planejamento 2026', createdAt: '2025-12-31T18:00:00.000Z', events: [] },
      { id: 'BL-18', tenantId: 'tenant-roboflex', kind: 'Realizado pago', categoryId: 'BC-OPER', period: '2025', amount: 120000, openAmount: 0, status: 'Liquidado', sourceModule: 'Omie', sourceType: 'Pagamento', sourceId: 'OPER-2025-400', description: 'Custo operacional de 2025 em Operações', sectorId: 'sec-pro', createdAt: '2025-12-31T18:00:00.000Z', events: [] },
      { id: 'BL-19', tenantId: 'tenant-roboflex', kind: 'Realizado pago', categoryId: 'BC-OPER', period: '2025', amount: 50000, openAmount: 0, status: 'Liquidado', sourceModule: 'Omie', sourceType: 'Pagamento', sourceId: 'OPER-2025-310', description: 'Custo operacional de 2025 em Engenharia', sectorId: 'sec-eng', createdAt: '2025-12-31T18:00:00.000Z', events: [] },
      { id: 'BL-20', tenantId: 'tenant-roboflex', kind: 'Realizado pago', categoryId: 'BC-OPER', period: '2025', amount: 30000, openAmount: 0, status: 'Liquidado', sourceModule: 'Omie', sourceType: 'Pagamento', sourceId: 'OPER-2025-320', description: 'Custo operacional de 2025 em Suprimentos', sectorId: 'sec-sup', createdAt: '2025-12-31T18:00:00.000Z', events: [] },
      { id: 'BL-16', tenantId: 'tenant-roboflex-sul', kind: 'Realizado recebido', categoryId: 'BC-ROB-SUL', period: '2025', amount: 16200000, openAmount: 0, status: 'Liquidado', sourceModule: 'Omie', sourceType: 'Recebimento', sourceId: 'FAT-2025-SUL', externalId: 'PG-ROB-SUL-2025', description: 'Faturamento consolidado de 2025 da Zontec · base do planejamento 2026', createdAt: '2025-12-31T18:00:00.000Z', events: [] },
      { id: 'BL-17', tenantId: 'tenant-roboflex-sul', kind: 'Realizado pago', categoryId: 'BC-CMV-SUL', period: '2025', amount: 740000, openAmount: 0, status: 'Liquidado', sourceModule: 'Omie', sourceType: 'Pagamento', sourceId: 'CMV-2025-SUL', externalId: 'PG-CMV-SUL-2025', description: 'Custo de mercadoria vendida de 2025 da Zontec · base do planejamento 2026', createdAt: '2025-12-31T18:00:00.000Z', events: [] },
    ],
    budgetExceptions: [
      { id: 'BX-1', tenantId: 'tenant-roboflex', kind: 'Sem categoria', status: 'Pendente', sourceModule: 'Omie', sourceId: 'PG-SEM-CAT', description: 'NF 8891 sem categoria', amount: 3250, categoryIds: [], period: '2026-10', createdAt: '2026-10-16T10:00:00.000Z' },
      { id: 'BX-4', tenantId: 'tenant-roboflex', kind: 'Sem vínculo', status: 'Pendente', sourceModule: 'Omie', sourceId: 'PG-9012', description: 'NF 9012 entrou no custo de garantia e ainda não aponta para um documento', amount: 890, categoryIds: ['BC-GARANTIA'], period: '2026-10', createdAt: '2026-10-18T16:00:00.000Z' },
      { id: 'BX-3', tenantId: 'tenant-roboflex', kind: 'Saldo excedido', status: 'Pendente', sourceModule: 'Demandas', sourceId: 'DM-106', description: 'Baixa de lote reprovado na inspeção: excede o saldo anual de Perdas em R$ 6.000,00', amount: 150000, categoryIds: ['BC-PERDAS'], period: '2026-10', createdAt: '2026-10-19T09:00:00.000Z' },
      { id: 'BX-2', tenantId: 'tenant-roboflex', kind: 'Saldo excedido', status: 'Autorizada', sourceModule: 'Demandas', sourceId: 'DM-EXC-1', description: 'Compra emergencial autorizada acima do saldo', amount: 14800, categoryIds: ['BC-PERDAS'], period: '2026-10', createdAt: '2026-10-14T10:00:00.000Z', decidedAt: '2026-10-14T11:00:00.000Z', decidedBy: 'Marina Souza', decisionNote: 'Parada de cliente crítico' },
    ],
    budgetSimulations: [],
    budgetAlerts: [
      { id: 'BAL-1', tenantId: 'tenant-roboflex', categoryId: 'BC-CMV', period: '2026-10', kind: 'Alerta', threshold: 80, use: 80.52, message: 'Custo Mercadoria Vendida 2026-10 atingiu 80,52% (limiar 80%)', notifiedRoles: ['Compras', 'Financeiro'], notifiedUserIds: ['u3', 'u14'], status: 'Aberto', at: '2026-10-18T14:05:00.000Z' },
      { id: 'BAL-2', tenantId: 'tenant-roboflex', categoryId: 'BC-PERDAS', period: '2026-10', kind: 'Bloqueio', threshold: 100, use: 0, message: 'DM-106 retido: baixa de lote reprovado excede o saldo anual de Perdas em R$ 6.000,00', notifiedRoles: ['Financeiro', 'Gestor'], notifiedUserIds: ['u14'], status: 'Aberto', at: '2026-10-19T09:00:00.000Z', sourceId: 'DM-106' },
    ],
    omieCategoryInbox: [
      { omieId: 'OMIE-04.01', code: '04.01', name: 'Frete sobre vendas', group: '04. Despesas Variáveis' },
    ],
    omiePayments: [
      { id: 'PG-SEM-CAT', invoiceNumber: '8891', sourceId: 'NF-8891', description: 'NF 8891 sem categoria', amount: 3250, paidAt: '2026-10-16T09:30:00.000Z', categoryIds: [], event: 'Pagamento' },
      { id: 'PG-9012', invoiceNumber: '9012', sourceId: 'NF-9012', description: 'NF 9012 · serviço avulso', amount: 890, paidAt: '2026-10-18T16:00:00.000Z', categoryIds: ['BC-GARANTIA'], event: 'Pagamento' },
      { id: 'PG-PARCIAL-7310', sourceId: 'PC-7310', amount: 11240, paidAt: '2026-10-18T14:00:00.000Z', categoryIds: ['BC-CMV'], event: 'Pagamento' },
      { id: 'PG-ESTORNO-7310', sourceId: 'PC-7310', amount: 1240, paidAt: '2026-10-19T09:00:00.000Z', categoryIds: ['BC-CMV'], event: 'Estorno' },
      { id: 'PG-MULTI-1', sourceId: 'NF-8892', amount: 2400, paidAt: '2026-10-19T10:00:00.000Z', categoryIds: ['BC-CMV', 'BC-OPER'], event: 'Pagamento' },
      { id: 'PG-ERRO-1', sourceId: 'PC-7000', amount: 1800, paidAt: '2026-10-18T15:00:00.000Z', categoryIds: ['BC-CMV'], event: 'Pagamento', error: 'Pagamento sem documento de origem conciliável' },
    ],
    salesOrders: [],
    omieQueue: [],
    productionOrders: [],
    requisitions: [],
    movements: [],
    downtimes: [],
    nonConformities: [],
    maintenanceOrders: [],
    alerts: [],
    events: [],
    syncLogs: [],
    priceTables: [
      { id: 'TP-PADRAO', name: 'Tabela padrão', currency: 'BRL', channel: 'Venda direta' },
      { id: 'TP-ECOM', name: 'E-commerce', currency: 'BRL', channel: 'Loja online' },
      { id: 'TP-EXP', name: 'Exportação', currency: 'USD', channel: 'Exportação' },
    ],
    itemModels: [],
    fiscalRules: [
      { id: 'MF-1', operation: 'Venda', originUf: 'MG', destUf: 'MG', ncmPrefix: '', cfop: '5101', cst: '00', icms: 18, ipi: 0, pis: 1.65, cofins: 7.6 },
      { id: 'MF-2', operation: 'Venda', originUf: 'MG', destUf: 'MG', ncmPrefix: '3926', cfop: '5401', cst: '10', icms: 18, ipi: 6.5, pis: 1.65, cofins: 7.6 },
      { id: 'MF-3', operation: 'Venda', originUf: 'MG', destUf: '*', ncmPrefix: '3926', cfop: '6101', cst: '00', icms: 7, ipi: 6.5, pis: 1.65, cofins: 7.6 },
      { id: 'MF-4', operation: 'Venda', originUf: 'MG', destUf: 'SP', ncmPrefix: '3926', cfop: '6401', cst: '10', icms: 12, ipi: 6.5, pis: 1.65, cofins: 7.6 },
      { id: 'MF-5', operation: 'Venda', originUf: 'MG', destUf: 'RS', ncmPrefix: '3926', cfop: '6101', cst: '00', icms: 12, ipi: 6.5, pis: 1.65, cofins: 7.6 },
      { id: 'MF-6', operation: 'Venda', originUf: 'MG', destUf: '*', ncmPrefix: '', cfop: '6101', cst: '00', icms: 7, ipi: 0, pis: 1.65, cofins: 7.6 },
      { id: 'MF-7', operation: 'Transferência', originUf: 'MG', destUf: 'ES', ncmPrefix: '', cfop: '6152', cst: '41', icms: 0, ipi: 0, pis: 0, cofins: 0 },
      { id: 'MF-8', operation: 'Remessa para conserto', originUf: 'MG', destUf: '*', ncmPrefix: '', cfop: '6915', cst: '50', icms: 0, ipi: 0, pis: 0, cofins: 0 },
    ],
    functionalities: FUNCTIONALITIES,
    tenants: [
      { id: 'tenant-roboflex', legalName: 'Roboflex', tradeName: 'Roboflex', document: '00.000.000/0001-91', city: 'Minas Gerais', status: 'Ativa', groupId: 'group-roboflex' },
      // Empresa-irmã só para demonstrar o planejamento de grupo em Orçamentos (meta combinada, gravação por empresa). Sem usuários/perfis próprios ainda: não é navegável como empresa completa.
      { id: 'tenant-roboflex-sul', legalName: 'Zontec Indústria Ltda', tradeName: 'Zontec', document: '00.000.000/0002-72', city: 'Caxias do Sul, RS', status: 'Ativa', groupId: 'group-roboflex' },
    ],
    economicGroups: [{ id: 'group-roboflex', name: 'Grupo Roboflex', description: 'Roboflex e Zontec. O planejamento é combinado; cada empresa grava o próprio dado.' }],
    omieConnections: [
      { tenantId: 'tenant-roboflex', appKey: 'demo-roboflex', secretDefined: true, status: 'Simulada', accountLabel: 'Conta de demonstração' },
      { tenantId: 'tenant-roboflex-sul', appKey: '', secretDefined: false, status: 'Não configurada', accountLabel: '' },
    ],
    accessProfiles: seededProfiles(),
    userProfileAssignments: [],
    counters: { OP: 24030, RC: 5100, NC: 310, OS: 880, EV: 0, SY: 0, MV: 0, DT: 0, AL: 0, PC: 7310, NF: 18420, DM: 104, AP: 7308, AR: 18420, PV: 1056, OM: 98510, MF: 8, TP: 3, U: 18 },
  }
}

const order = (id: string, omieId: string, customerId: string, itemId: string, quantity: number, promisedDate: string, priority: SalesOrder['priority'], value: number, receivedAt: string): SalesOrder =>
  ({ id, omieId, customerId, itemId, quantity, promisedDate, priority, value, receivedAt, planned: false })

/** Admissão, trajetória e um desligamento em andamento. Currículo e leitura de IA são texto fixo de demonstração. */
function seedPeople(state: ErpState) {
  const tenantId = 'tenant-roboflex'
  state.assignments = state.users.filter(user => user.id !== 'u6' && !user.platformMaster).map(user => ({
    id: `ASG-${user.id}`,
    userId: user.id,
    sector: user.sector,
    positionId: user.positionId,
    validFrom: '2024-01-01',
    actor: 'Demonstração',
  }))
  state.assignments.push(
    { id: 'ASG-JOAO-1', userId: 'u6', sector: 'Montagem', positionId: 'pos-op', validFrom: '2023-03-01', validTo: '2024-06-30', actor: 'Demonstração' },
    { id: 'ASG-JOAO-2', userId: 'u6', sector: 'Injeção', positionId: 'pos-op', validFrom: '2024-07-01', actor: 'Demonstração' },
  )
  state.performanceReviews = [
    { id: 'AV-1', userId: 'u6', scoreLabel: '4', scale: '0 a 5', period: '2025', origin: 'Gestor direto', at: '2026-01-15T12:00:00.000Z', actor: 'Bruno Alves' },
    { id: 'AV-2', userId: 'u6', scoreLabel: 'B', scale: 'A a E', period: '2024', origin: 'Avaliação de experiência', at: '2024-08-01T12:00:00.000Z', actor: 'Bruno Alves' },
  ]
  state.jobOpenings = [
    {
      id: 'VAGA-INJ', tenantId, title: 'Operador de injeção', sectorId: 'sec-pro', requesterId: 'u5', ownerId: 'u1',
      description: 'Cobrir o turno da injetora 02.', requirements: ['Injeção de termoplásticos', 'Autocontrole de qualidade', 'Disponibilidade de turno'],
      status: 'Aberta', openedOn: '2026-09-01', targetOn: '2026-11-15',
    },
    {
      id: 'VAGA-COM', tenantId, title: 'Analista de compras', sectorId: 'sec-sup', requesterId: 'u3', ownerId: 'u3',
      description: 'Apoiar cotações de resina.', requirements: ['Cotação com fornecedor'],
      status: 'Aberta', openedOn: '2026-10-01',
    },
  ]
  state.candidates = [
    {
      id: 'CD-RICARDO', tenantId, name: 'Ricardo Pires', email: 'ricardo.pires@email.com', phone: '31988887777', resumeName: 'ricardo-pires.pdf',
      resumeText: 'Operador com injeção de termoplásticos, autocontrole de qualidade e disponibilidade de turno na indústria.',
    },
    {
      id: 'CD-HELENA', tenantId, name: 'Helena Dias', email: 'helena.dias@email.com', phone: '31977776666', resumeName: 'helena-dias.pdf',
      resumeText: 'Experiência em injeção de termoplásticos e autocontrole de qualidade. Horário comercial.',
    },
  ]
  state.applications = [
    { id: 'CA-RICARDO', tenantId, candidateId: 'CD-RICARDO', jobId: 'VAGA-INJ', stage: 'Triagem', history: [{ at: '2026-10-10T12:00:00.000Z', actor: 'Marina Souza', text: 'Candidatura aberta em triagem' }] },
    { id: 'CA-HELENA', tenantId, candidateId: 'CD-HELENA', jobId: 'VAGA-INJ', stage: 'Entrevista', history: [{ at: '2026-10-08T12:00:00.000Z', actor: 'Marina Souza', text: 'Candidatura aberta em triagem' }, { at: '2026-10-18T12:00:00.000Z', actor: 'Bruno Alves', text: 'Entrevista presencial registrada' }] },
  ]
  state.interviews = [
    { id: 'ENT-RICARDO', applicationId: 'CA-RICARDO', at: '2026-10-30T14:00:00', place: 'Sala de reunião 1', interviewerIds: ['u5'], confirmed: false, notes: '' },
    { id: 'ENT-HELENA', applicationId: 'CA-HELENA', at: '2026-10-22T09:00:00', place: 'Sala de reunião 1', interviewerIds: ['u5'], confirmed: true, notes: '' },
  ]
  state.selectionReviews = [
    { id: 'SEL-HELENA', applicationId: 'CA-HELENA', origin: 'Entrevista presencial', notes: 'Conhece o processo. Turno ainda em aberto.', actor: 'Bruno Alves', at: '2026-10-22T11:00:00.000Z' },
  ]
  state.candidateBriefings = [
    {
      id: 'IA-RICARDO', applicationId: 'CA-RICARDO', version: 'pessoas-ia-demo-1',
      criteria: ['Injeção de termoplásticos', 'Autocontrole de qualidade', 'Disponibilidade de turno'],
      evidence: ['Injeção de termoplásticos', 'Autocontrole de qualidade', 'Disponibilidade de turno'],
      gaps: [], questions: [], suggested: true, at: '2026-10-16T12:00:00.000Z',
      summary: 'Ricardo Pires: 3 requisito(s) com evidência no texto e 0 lacuna(s). A decisão continua humana.',
    },
    {
      id: 'IA-HELENA', applicationId: 'CA-HELENA', version: 'pessoas-ia-demo-1',
      criteria: ['Injeção de termoplásticos', 'Autocontrole de qualidade', 'Disponibilidade de turno'],
      evidence: ['Injeção de termoplásticos', 'Autocontrole de qualidade'],
      gaps: ['Disponibilidade de turno'], questions: ['Conte uma experiência relacionada a: Disponibilidade de turno'],
      suggested: false, at: '2026-10-16T12:00:00.000Z',
      summary: 'Helena Dias: 2 requisito(s) com evidência no texto e 1 lacuna(s). A decisão continua humana.',
    },
  ]
  const item = (id: string, label: string, owner: string, kind: 'geral' | 'ativo' | 'acesso' | 'confirmacao', required: boolean, status: 'Pendente' | 'Concluído' | 'Falha' = 'Pendente', dueOn?: string) =>
    ({ id, label, owner, kind, required, status, dueOn })
  state.peopleChecklists = [
    { id: 'CHK-VAGA-INJ', tenantId, process: 'admissao', refId: 'VAGA-INJ', items: [item('CKI-INJ-1', 'Currículo organizado na candidatura', 'Admissão', 'geral', true), item('CKI-INJ-2', 'Contato conferido', 'Admissão', 'geral', true)] },
    { id: 'CHK-VAGA-COM', tenantId, process: 'admissao', refId: 'VAGA-COM', items: [item('CKI-COM-1', 'Currículo organizado na candidatura', 'Admissão', 'geral', true), item('CKI-COM-2', 'Contato conferido', 'Admissão', 'geral', true)] },
    { id: 'CHK-CA-RICARDO', tenantId, process: 'admissao', refId: 'CA-RICARDO', items: [item('CKI-R-1', 'Currículo organizado na candidatura', 'Admissão', 'geral', true, 'Concluído'), item('CKI-R-2', 'Contato conferido', 'Admissão', 'geral', true)] },
    { id: 'CHK-CA-HELENA', tenantId, process: 'admissao', refId: 'CA-HELENA', items: [item('CKI-H-1', 'Currículo organizado na candidatura', 'Admissão', 'geral', true, 'Concluído'), item('CKI-H-2', 'Contato conferido', 'Admissão', 'geral', true, 'Concluído')] },
    {
      id: 'CHK-DES-1', tenantId, process: 'desligamento', refId: 'DES-1',
      items: [
        item('CKI-D-1', 'Comunicação aos responsáveis', 'A definir', 'geral', true, 'Concluído', '2026-10-20'),
        item('CKI-D-2', 'Transferência de atividades', 'A definir', 'geral', true, 'Pendente', '2026-10-20'),
        item('CKI-D-3', 'Devolução de equipamentos', 'A definir', 'ativo', true, 'Pendente', '2026-10-20'),
        item('CKI-D-4', 'Encerramento de acessos', 'A definir', 'acesso', true, 'Pendente', '2026-10-20'),
        item('CKI-D-5', 'Documentos e pendências', 'A definir', 'geral', false, 'Pendente', '2026-10-20'),
        item('CKI-D-6', 'Confirmação final', 'A definir', 'confirmacao', true, 'Pendente', '2026-10-20'),
      ],
    },
  ]
  state.offboardings = [
    { id: 'DES-1', tenantId, userId: 'u17', effectiveOn: '2026-10-20', reason: 'Pedido de desligamento informado pela área', status: 'Em andamento', startedAt: '2026-10-13T12:00:00.000Z', startedBy: 'Marina Souza' },
  ]
  const seen = new Set<string>()
  for (const user of state.users) {
    if (user.platformMaster || seen.has(user.id)) continue
    seen.add(user.id)
    const personTenant = user.homeTenantId ?? tenantId
    const personId = `p-${user.id}`
    user.personId = personId
    user.homeTenantId = personTenant
    state.persons.push({
      id: personId, tenantId: personTenant, fullName: user.name, corporateEmail: user.email,
      phone: user.id === 'u6' ? '31999990006' : undefined,
      cpf: user.id === 'u11' ? '111.222.333-44' : undefined,
      birthDate: user.id === 'u6' ? '1994-04-12' : undefined,
      education: user.id === 'u13' ? [{ institution: 'UFMG', course: 'Engenharia mecânica', level: 'Graduação' }] : [],
      family: [], emergencies: user.id === 'u6' ? [{ name: 'Maria Pereira', phone: '31988880006', bond: 'Mãe' }] : [],
      banks: user.id === 'u6' ? [{ bank: '001', agency: '1234', account: '56789-0', kind: 'Corrente' }] : [],
      address: user.id === 'u6' ? { street: 'Rua das Acácias', number: '120', district: 'Industrial', zip: '32000-000', state: 'MG', city: 'Contagem' } : undefined,
      drugAllergy: user.id === 'u6' ? 'Dipirona' : undefined,
      commute: user.id === 'u6' ? 'Ônibus · 2 · vale informado' : undefined,
      notes: user.id === 'u6' ? 'Operador da injetora 02.' : undefined,
    })
    state.employments.push({
      id: `emp-${user.id}`, tenantId: personTenant, personId, contractType: 'CLT', startedOn: '2024-01-01', status: 'Ativo',
      salary: user.id === 'u6' ? 3200 : undefined, workplace: user.sector,
    })
  }
  state.workspaceConnections = [
    { tenantId: 'tenant-roboflex', provider: 'Google', domain: 'roboflex.com.br', secretDefined: true, status: 'Simulada' },
    { tenantId: 'tenant-roboflex-sul', provider: 'Google', domain: 'zontec.com.br', secretDefined: true, status: 'Simulada' },
  ]
  const diegoSul = 'p-z-diego'
  state.persons.push({
    id: diegoSul, tenantId: 'tenant-roboflex-sul', fullName: 'Diego Martins', corporateEmail: 'diego.martins@zontec.com.br',
    cpf: '111.222.333-44', education: [], family: [], emergencies: [], banks: [],
  })
  state.employments.push({ id: 'emp-z-diego', tenantId: 'tenant-roboflex-sul', personId: diegoSul, contractType: 'CLT', startedOn: '2025-03-01', status: 'Ativo', salary: 4100, workplace: 'Engenharia Zontec' })
  state.users.push({
    id: 'u19', name: 'Diego Martins', role: 'Manutenção', sector: 'Engenharia Zontec', shift: 'Administrativo', pin: '1919',
    email: 'diego.martins@zontec.com.br', positionId: 'pos-z-eng', personId: diegoSul, homeTenantId: 'tenant-roboflex-sul', active: true,
  })
  state.assignments.push({ id: 'ASG-u19', userId: 'u19', sector: 'Engenharia Zontec', positionId: 'pos-z-eng', validFrom: '2025-03-01', actor: 'Demonstração' })
  state.counters.U = 19
  state.identityLinks = [
    { id: 'IDN-DIEGO', leftPersonId: 'p-u11', rightPersonId: diegoSul, status: 'Confirmado', basis: 'Confirmação humana', actor: 'Marina Souza', at: '2026-08-01T12:00:00.000Z' },
    { id: 'IDN-CAMILA', leftPersonId: 'p-u12', rightPersonId: 'p-z-echo', status: 'Sugerido', basis: 'E-mail', at: '2026-10-01T12:00:00.000Z' },
  ]
  state.persons.push({
    id: 'p-z-echo', tenantId: 'tenant-roboflex-sul', fullName: 'Camila Nunes', corporateEmail: 'camila@roboflex.com.br',
    education: [], family: [], emergencies: [], banks: [],
  })
  state.projectParticipations = [
    { id: 'PRT-HELENA', projectId: 'PRJ-26-014', hostTenantId: tenantId, personId: 'p-u18', sourceTenantId: 'tenant-roboflex-sul', displayName: 'Helena Duarte', jobTitle: 'Engenheiro de produto', contact: 'helena.duarte@zontec.com.br', role: 'Apoio de processo' },
  ]
  for (const demand of state.demands) {
    const owner = state.users.find(entry => entry.id === demand.requester)
    if (owner?.personId) demand.requesterPersonId = owner.personId
  }
  state.directoryAccounts = state.persons.flatMap(person => {
    const domain = state.workspaceConnections.find(entry => entry.tenantId === person.tenantId)?.domain
    const email = person.corporateEmail?.toLowerCase()
    if (!email || !domain || !email.endsWith(`@${domain}`)) return []
    const overdue = person.id === 'p-u17'
    return [{
      id: `gda-${person.id}`, tenantId: person.tenantId, personId: person.id, provider: 'Google' as const, email,
      externalId: `gws-${email}`, status: overdue ? 'Falha' as const : 'Ativa' as const,
      pendingAction: overdue ? 'Suspender' as const : undefined,
      failure: overdue ? 'A data efetiva já passou e o Google recusou a suspensão. A conta segue ativa.' : undefined,
      requestedBy: 'Demonstração', requestedAt: '2024-01-01T12:00:00.000Z',
    }]
  })
}

/** Executa as próprias regras do motor para montar um cenário coerente em diferentes etapas. */
export function createSeedState(): ErpState {
  const s = baseState()
  seedPeople(s)
  s.userProfileAssignments = s.users.filter(user => !user.platformMaster && user.homeTenantId !== 'tenant-roboflex-sul').map((user, index) => ({
    id: `UP-${index + 1}`,
    userId: user.id,
    tenantId: user.homeTenantId ?? 'tenant-roboflex',
    profileId: `profile-${profileCode(user.role)}`,
  }))
  s.accessProfiles.push(
    {
      id: 'profile-zontec-admin', tenantId: 'tenant-roboflex-sul', code: 'administrador', name: 'Administrador',
      description: 'Acesso administrativo da Zontec, atribuído à mão.', system: true, functionalityIds: FUNCTIONALITIES.map(entry => entry.id), simulatedRole: 'Administrador',
    },
    {
      id: 'profile-zontec-eng', tenantId: 'tenant-roboflex-sul', code: 'engenharia', name: 'Engenharia',
      description: 'Engenharia da Zontec.', system: false, functionalityIds: [moduleFeature('Produtos')], simulatedRole: 'Engenharia',
    },
  )
  s.userProfileAssignments.push(
    { id: 'UP-LUCAS-ZONTEC', userId: 'u16', tenantId: 'tenant-roboflex-sul', profileId: 'profile-zontec-admin' },
    { id: 'UP-HELENA-ZONTEC', userId: 'u18', tenantId: 'tenant-roboflex-sul', profileId: 'profile-zontec-eng' },
    { id: 'UP-DIEGO-ZONTEC', userId: 'u19', tenantId: 'tenant-roboflex-sul', profileId: 'profile-zontec-eng' },
  )
  prepareCatalog(s)
  preparePartners(s)
  const at = (dayOffset: number, hour: number, minute = 0) => setClock(new Date(2026, 9, 15 + dayOffset, hour, minute))
  const runOperations = (opId: string, operator: string) => {
    const op = s.productionOrders.find(entry => entry.id === opId)!
    for (const operation of op.operations) {
      if (operation.status === 'Concluída') continue
      startOperation(s, opId, operation.id, operator)
      const quantity = operation.name === 'Retrabalho' ? 2 : op.quantity
      if (operation.firstPiece && !operation.firstPieceAt) {
        reportProduction(s, opId, operation.id, 1, 0, '', operator)
        approveFirstPiece(s, opId, operation.id, 'Fernanda Rocha')
        if (quantity > 1) reportProduction(s, opId, operation.id, quantity - 1, 0, '', operator)
      } else {
        reportProduction(s, opId, operation.id, quantity, 0, '', operator)
      }
      finishOperation(s, opId, operation.id, operator)
    }
  }
  const opsFor = (orderId: string) => s.productionOrders.filter(op => op.salesOrderId === orderId)

  try {
    s.salesOrders.push(
      order('PV-2026-1056', 'OM-98510', 'c6', 'pa-lite-ipad', 40, '2026-10-29', 'Normal', 9840, '2026-10-15T10:40:00.000Z'),
      order('PV-2026-1054', 'OM-98492', 'c3', 'pa-a11-imp', 50, '2026-10-27', 'Normal', 21800, '2026-10-14T19:20:00.000Z'),
      order('PV-2026-1051', 'OM-98473', 'c2', 'pa-a11-ext', 80, '2026-10-22', 'Alta', 49600, '2026-10-13T12:10:00.000Z'),
      order('PV-2026-1048', 'OM-98451', 'c1', 'pa-s9-min', 120, '2026-10-20', 'Urgente', 89400, '2026-10-12T13:00:00.000Z'),
      order('PV-2026-1041', 'OM-98388', 'c4', 'pa-lite-ipad', 30, '2026-10-17', 'Alta', 7380, '2026-10-09T14:30:00.000Z'),
      order('PV-2026-1039', 'OM-98342', 'c5', 'pa-a11-imp', 24, '2026-10-16', 'Normal', 10460, '2026-10-08T17:45:00.000Z'),
      order('PV-2026-1036', 'OM-98301', 'c3', 'pa-a11-imp', 36, '2026-10-15', 'Normal', 15700, '2026-10-06T11:00:00.000Z'),
      order('PV-2026-1033', 'OM-98266', 'c2', 'pa-a11-ext', 30, '2026-10-14', 'Alta', 18600, '2026-10-05T16:20:00.000Z'),
    )
    s.omieQueue.push(
      order('PV-2026-1058', 'OM-98533', 'c4', 'pa-a11-imp', 20, '2026-10-30', 'Normal', 8720, ''),
      order('PV-2026-1060', 'OM-98547', 'c1', 'pa-s9-min', 40, '2026-11-03', 'Alta', 29800, ''),
    )

    // Histórico: pedido completo, do planejamento ao faturamento
    at(-9, 8); planOrder(s, 'PV-2026-1033', 'Paulo Mendes')
    at(-8, 7, 30); pickOp(s, opsFor('PV-2026-1033')[0].id, 'Carlos Lima')
    at(-7, 8); runOperations(opsFor('PV-2026-1033')[0].id, 'Ana Costa')
    at(-6, 10); approveInspection(s, opsFor('PV-2026-1033')[0].id, 'Fernanda Rocha')
    at(-6, 14); confirmShipment(s, 'PV-2026-1033', 3, 'Rodonaves', 'Rafael Souza')
    at(-6, 15); const invoiceLog = shipOrder(s, 'PV-2026-1033', 'Rafael Souza')
    at(-6, 15, 20); invoiceOrder(s, 'PV-2026-1033', invoiceLog.id)

    // Pedido com retrabalho que agora aguarda conferência na expedição
    at(-7, 9); planOrder(s, 'PV-2026-1036', 'Paulo Mendes')
    at(-5, 7, 40); const op1036 = opsFor('PV-2026-1036')[0].id; pickOp(s, op1036, 'Carlos Lima')
    at(-4, 8); runOperations(op1036, 'Ana Costa')
    at(-3, 9); rejectInspection(s, op1036, 2, 'Risco na tampa traseira', 'Fernanda Rocha')
    at(-3, 13); runOperations(op1036, 'Ana Costa')
    at(-2, 9); approveInspection(s, op1036, 'Fernanda Rocha')
    updateNonConformity(s, s.nonConformities[0].id, 'Em análise', 'Revisar proteção das tampas no supermercado da injeção', 'Fernanda Rocha')

    // Pedido em inspeção final
    at(-6, 9); planOrder(s, 'PV-2026-1039', 'Paulo Mendes')
    at(-2, 7, 30); const op1039 = opsFor('PV-2026-1039')[0].id; pickOp(s, op1039, 'Carlos Lima')
    at(-1, 8); runOperations(op1039, 'Ana Costa')

    // Pedido em montagem: embalagem em andamento
    at(-5, 10); planOrder(s, 'PV-2026-1041', 'Paulo Mendes')
    at(-1, 7, 30); const op1041 = opsFor('PV-2026-1041')[0]; pickOp(s, op1041.id, 'Carlos Lima')
    at(0, 7, 10)
    startOperation(s, op1041.id, op1041.operations[0].id, 'Ana Costa')
    reportProduction(s, op1041.id, op1041.operations[0].id, 30, 0, '', 'Ana Costa')
    finishOperation(s, op1041.id, op1041.operations[0].id, 'Ana Costa')
    at(0, 8, 5)
    startOperation(s, op1041.id, op1041.operations[1].id, 'Ana Costa')
    reportProduction(s, op1041.id, op1041.operations[1].id, 18, 0, '', 'Ana Costa')

    // Pedido urgente: injeção em andamento, montagem aguardando peças e placas
    at(-3, 9); planOrder(s, 'PV-2026-1048', 'Paulo Mendes')
    const [injS9Frame, injS9Cover] = opsFor('PV-2026-1048').filter(op => op.kind === 'Injeção')
    at(-2, 10); for (const req of s.requisitions.filter(entry => entry.origin.startsWith('PV-2026-1048'))) {
      advanceRequisition(s, req.id, 'Juliana Reis'); advanceRequisition(s, req.id, 'Juliana Reis'); advanceRequisition(s, req.id, 'Marina Souza')
    }
    at(0, 6, 50); pickOp(s, injS9Frame.id, 'Carlos Lima'); pickOp(s, injS9Cover.id, 'Carlos Lima')
    at(0, 7, 5)
    startOperation(s, injS9Frame.id, injS9Frame.operations[0].id, 'João Pereira')
    reportProduction(s, injS9Frame.id, injS9Frame.operations[0].id, 1, 0, '', 'João Pereira')
    at(0, 7, 20); approveFirstPiece(s, injS9Frame.id, injS9Frame.operations[0].id, 'Fernanda Rocha')
    reportProduction(s, injS9Frame.id, injS9Frame.operations[0].id, 39, 2, 'Rebarba excessiva', 'João Pereira')
    at(0, 8, 30); reportProduction(s, injS9Frame.id, injS9Frame.operations[0].id, 30, 1, 'Bolha / chupagem', 'João Pereira')
    // Primeira peça da tampa aguardando a qualidade no tablet
    at(0, 7, 15); startOperation(s, injS9Cover.id, injS9Cover.operations[0].id, 'Lucas Ferreira')
    reportProduction(s, injS9Cover.id, injS9Cover.operations[0].id, 1, 0, '', 'Lucas Ferreira')
    at(0, 8, 40); pauseOperation(s, injS9Cover.id, injS9Cover.operations[0].id, 'Aguardando qualidade', 'Lucas Ferreira')

    // Pedido aguardando materiais: TPU e placas em compra
    at(-2, 11); planOrder(s, 'PV-2026-1051', 'Paulo Mendes')
    at(-1, 9)
    for (const req of s.requisitions.filter(entry => entry.origin.startsWith('PV-2026-1051'))) {
      const item = s.items.find(entry => entry.id === req.itemId)!
      if (item.id === 'mp-tpu') advanceRequisition(s, req.id, 'Juliana Reis')
      if (item.id === 'cp-cabo') { advanceRequisition(s, req.id, 'Juliana Reis'); advanceRequisition(s, req.id, 'Marina Souza') }
    }

    // Manutenção, alertas e integração
    at(0, 6, 20); createMaintenance(s, 'a-inj3', 'Corretiva', 'Vazamento de óleo no cilindro de fechamento', 'Ronda de manutenção', 'Diego Martins')
    at(-1, 16); createMaintenance(s, 'a-inj1', 'Preventiva', 'Preventiva mensal: lubrificação e reaperto', 'Plano de manutenção', 'Sistema')
    at(0, 8, 50); raiseAlert(s, 'mont2', 'Ana Costa', 'Etiquetas de lote acabando na célula')
    at(0, 6, 0)
    addSyncLog(s, { entity: 'Produto', reference: 'RF-H-S9-MIN', direction: 'Thalamus → Omie', status: 'erro', message: 'NCM obrigatório não informado no cadastro fiscal' })
    s.downtimes.push(
      { id: 'DT-h1', resourceId: 'inj1', opId: 'histórico', reason: 'Setup / troca de molde', start: '2026-10-13T11:00:00.000Z', end: '2026-10-13T12:10:00.000Z' },
      { id: 'DT-h2', resourceId: 'inj2', opId: 'histórico', reason: 'Falta de material', start: '2026-10-13T17:00:00.000Z', end: '2026-10-13T17:45:00.000Z' },
      { id: 'DT-h3', resourceId: 'inj1', opId: 'histórico', reason: 'Ajuste de processo', start: '2026-10-14T13:20:00.000Z', end: '2026-10-14T13:55:00.000Z' },
      { id: 'DT-h4', resourceId: 'mont1', opId: 'histórico', reason: 'Falta de material', start: '2026-10-14T15:00:00.000Z', end: '2026-10-14T16:20:00.000Z' },
      { id: 'DT-h5', resourceId: 'inj3', opId: 'histórico', reason: 'Quebra de máquina', start: '2026-10-12T12:00:00.000Z', end: '2026-10-12T15:30:00.000Z' },
      { id: 'DT-h6', resourceId: 'inj2', opId: 'histórico', reason: 'Setup / troca de molde', start: '2026-10-14T10:00:00.000Z', end: '2026-10-14T10:50:00.000Z' },
    )
  } finally {
    setClock(null)
  }
  for (const category of s.budgetCategories) category.omieId = `OMIE-${category.code}`
  const horizonte = s.partners.find(partner => partner.id === 'c1')
  if (horizonte) {
    horizonte.abcSuggestions = [{
      id: 'ABC-2026', year: '2026',
      billing: s.salesOrders.filter(entry => entry.customerId === 'c1' && entry.receivedAt.startsWith('2026')).reduce((sum, entry) => sum + entry.value, 0),
      status: 'Pendente', createdAt: '2026-10-20T12:00:00.000Z',
      note: 'Limites A, B e C ainda não definidos. Nenhuma classe foi sugerida e a classe vigente não muda.',
    }]
  }
  return s
}

/** Catálogo, árvore, versões de estrutura com vigência e lotes iniciais. */
function preparePartners(s: ErpState) {
  const abs = s.items.find(item => item.id === 'mp-abs')
  const tpu = s.items.find(item => item.id === 'mp-tpu')
  if (abs) abs.criticality = 'C1'
  if (tpu) tpu.criticality = 'C2'
  s.supplierHomologations = [
    { id: 'HOM-MP-ABS', partnerId: 'f1', itemId: 'mp-abs', status: 'Homologado', reference: 'HOM-MP-ABS', validUntil: '2027-03-31', tests: 'Tração e fluidez, laudo P&D PD-118' },
  ]
}

function prepareCatalog(s: ErpState) {
  for (const item of s.items) {
    item.catalog = defaultCatalog(item)
    item.catalog.classId = ensureClassPath(s, seedPath(item))
  }
  ensureClassPath(s, ['Componentes', 'Elétricos', 'Baterias'])
  ensureClassPath(s, ['Serviços', 'Engenharia'])
  const gabarito = s.items.find(item => item.id === 'fe-g11')!
  gabarito.catalog!.classId = ensureClassPath(s, ['Ferramental', 'Gabaritos de montagem'])

  const injectionRouting: Record<string, RouteStep[]> = {
    'se-mold-a11': injection('fe-m112', 'inj1', 42, 2),
    'se-tampa-a11': injection('fe-m113', 'inj2', 48, 1),
    'se-bump-a11': injection('fe-m114', 'inj3', 55, 2, [step('reb', 'Rebarbação', 'mont2', 0.3, ['Retirar rebarba do ponto de injeção', 'Conferir encaixe no calibre'], { crew: 1 })]),
    'se-mold-s9': injection('fe-m121', 'inj2', 46, 2),
    'se-tampa-s9': injection('fe-m122', 'inj1', 52, 1),
    'se-base-lite': injection('fe-m090', 'inj1', 38, 1),
  }
  for (const [id, routing] of Object.entries(injectionRouting)) s.items.find(item => item.id === id)!.routing = routing
  for (const item of s.items.filter(entry => entry.type === '04' && !entry.moldId)) {
    for (const entry of item.routing ?? []) {
      entry.crew ??= 1
      entry.setupMinutes ??= entry.name.startsWith('Teste') ? 10 : 15
    }
  }
  const extMec = s.items.find(item => item.id === 'pa-a11-ext')!.routing!.find(entry => entry.id === 'mec')!
  Object.assign(extMec, { toolId: 'fe-g11', firstPiece: true, serviceId: 'sv-mont', serviceInstructionVersion: 1 })

  const ext = s.items.find(item => item.id === 'pa-a11-ext')!
  const lines = (id: string) => (s.items.find(item => item.id === id)!.bom ?? []).map(line => ({ ...line }))
  const extOld = lines('pa-a11-ext').filter(line => line.itemId !== 'cp-alca').map(line => line.itemId === 'cp-paraf' ? { ...line, quantity: 6 } : line)
  s.productRevisions.push({
    id: 'rev-a11-b', itemId: ext.id, code: 'B', status: 'Substituída', createdAt: '2026-02-20T10:00:00.000Z', createdBy: 'Eduardo Freitas',
    releasedAt: '2026-03-02T10:00:00.000Z', releasedBy: 'Eduardo Freitas', validFrom: '2026-03-02', validTo: '2026-08-09',
    checklist: [{ label: 'Estrutura conferida', done: true }, { label: 'Roteiro conferido', done: true }], notes: 'Primeira versão com placa pogo pin.', lines: extOld,
  })
  for (const revision of s.productRevisions) {
    revision.createdBy ??= 'Eduardo Freitas'
    if (revision.lines) continue
    revision.lines = lines(revision.itemId)
    if (revision.status === 'Liberada') revision.validFrom = revision.releasedAt?.slice(0, 10)
  }
  const draftD = s.productRevisions.find(entry => entry.id === 'rev-a11-d')
  if (draftD) draftD.lines = draftD.lines!.map(line => line.itemId === 'cp-paraf' ? { ...line, quantity: 10 } : line)
  const revC = s.productRevisions.find(entry => entry.id === 'rev-a11-c')
  if (revC) revC.validTo = undefined

  for (const item of s.items.filter(entry => entry.bom?.length && ['03', '04', '06'].includes(entry.type))) {
    let current = s.productRevisions.find(entry => entry.itemId === item.id && entry.status === 'Liberada')
    if (!current) {
      current = {
        id: `rev-${item.id}-${(item.revision ?? 'A').toLowerCase()}`, itemId: item.id, code: item.revision ?? 'A', status: 'Liberada',
        createdAt: '2026-08-01T12:00:00.000Z', createdBy: 'Carga inicial', releasedAt: '2026-08-01T12:00:00.000Z', releasedBy: 'Carga inicial',
        validFrom: '2026-08-01', checklist: [{ label: 'Estrutura conferida', done: true }], notes: 'Versão da carga inicial', lines: lines(item.id),
      }
      s.productRevisions.push(current)
    }
    item.currentRevisionId = current.id
    item.revision = current.code
  }
  for (const revision of s.productRevisions) {
    const owner = s.items.find(item => item.id === revision.itemId)
    if (owner?.routing?.length) revision.routing ??= owner.routing.map(entry => ({ ...entry, instructions: [...entry.instructions] }))
  }
  if (draftD?.routing) {
    draftD.changeId = 'ECO-0001'
    const sealing = draftD.routing.findIndex(entry => entry.id === 'tst')
    draftD.routing.splice(sealing, 0, step('vpt', 'Vedação portuária', 'mont1', 3, ['Aplicar junta de EPDM no perímetro', 'Conferir assentamento com calibre de folga'], { crew: 1, setupMinutes: 10 }))
  }
  const revCLinked = s.productRevisions.find(entry => entry.id === 'rev-a11-c')
  if (revCLinked) revCLinked.changeId = 'ECO-0003'

  for (const item of s.items.filter(entry => (entry.catalog?.lot || entry.catalog?.expiry) && entry.stock > 0)) {
    if (item.id === 'mp-tpu') continue
    if (item.id === 'mp-abs') {
      item.lots = [
        { code: 'L260902-014', quantity: 180, receivedAt: '2026-09-02T10:00:00.000Z' },
        { code: 'L261006-031', quantity: item.stock - 180, receivedAt: '2026-10-06T10:00:00.000Z' },
      ]
      continue
    }
    item.lots = [{ code: 'L-SALDO', quantity: item.stock, receivedAt: '2026-08-01T12:00:00.000Z' }]
  }
  const film = s.items.find(item => item.id === 'cp-pelic')?.catalog
  if (film) {
    film.lifecycle = 'Alteração pendente'
    film.keyChanges.unshift({
      id: 'EXC-0001', field: 'ncm', from: film.ncm, to: '39095019', reason: 'Película passou a ser de TPU, não de vidro temperado. O NCM de vidro não se aplica mais',
      originModule: 'OP', originId: 'OP-441',
      requestedBy: 'Eduardo Freitas', requestedAt: '2026-10-16T14:20:00.000Z', status: 'Pendente',
    })
  }
  const tpu = s.items.find(item => item.id === 'mp-tpu')!
  tpu.lots = [
    { code: 'L260930-022', quantity: 0.8, receivedAt: '2026-09-30T10:00:00.000Z', expiry: '2027-03-28' },
    { code: 'L260815-007', quantity: 1.2, receivedAt: '2026-08-15T10:00:00.000Z', expiry: '2026-11-10' },
  ]
  prepareExtendedLayers(s)
}

/** Desenho simples do produto para a foto principal; na vida real é o arquivo enviado pela engenharia. */
const sketch = (label: string, color: string) => `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="220" viewBox="0 0 320 220"><rect width="320" height="220" fill="#F3F6FA"/><rect x="70" y="30" width="180" height="150" rx="18" fill="${color}"/><rect x="88" y="48" width="144" height="104" rx="6" fill="#1D2B3A"/><rect x="55" y="70" width="15" height="70" rx="6" fill="${color}"/><rect x="250" y="70" width="15" height="70" rx="6" fill="${color}"/><text x="160" y="205" font-family="Arial" font-size="15" text-anchor="middle" fill="#41536B">${label}</text></svg>`,
)}`

/** Camadas da especificação completa: preços, custos com vigência, EANs, mídia, projeto, fiscal estendido e grade. */
function prepareExtendedLayers(s: ErpState) {
  const catalogOf = (id: string) => s.items.find(item => item.id === id)!.catalog!
  const price = (id: string, tableId: string, value: number, validFrom = '2026-08-01', unit = 'un', validTo?: string) =>
    catalogOf(id).prices.push({ id: `PR-${id}-${tableId}-${validFrom}`, tableId, unit, value, validFrom, validTo, createdBy: 'Camila Duarte' })

  price('pa-a11-ext', 'TP-PADRAO', 620)
  price('pa-a11-ext', 'TP-EXP', 119)
  price('pa-a11-imp', 'TP-PADRAO', 418, '2026-08-01', 'un', '2026-09-30')
  price('pa-a11-imp', 'TP-PADRAO', 436, '2026-10-01')
  price('pa-a11-imp', 'TP-PADRAO', 452, '2026-11-01')
  price('pa-a11-imp', 'TP-ECOM', 459)
  price('pa-s9-min', 'TP-PADRAO', 745)
  price('pa-s9-min', 'TP-EXP', 139)
  price('pa-lite-ipad', 'TP-PADRAO', 246)
  price('pa-lite-ipad', 'TP-ECOM', 269)
  price('mr-carregador', 'TP-PADRAO', 89)
  price('kf-frota', 'TP-PADRAO', 2050, '2026-08-01', 'kit')
  price('kt-vitrine', 'TP-PADRAO', 470)
  const impPrices = catalogOf('pa-a11-imp').prices
  impPrices[1].validTo = '2026-10-31'

  const ext = catalogOf('pa-a11-ext')
  ext.conversions.push({ unit: 'cx10', factor: 10, context: 'Venda' })
  price('pa-a11-ext', 'TP-PADRAO', 6050, '2026-08-01', 'cx10')
  ext.barcodes.push({ code: withCheckDigit(`1${ext.gtin.slice(0, 12)}`), kind: 'DUN-14', unit: 'cx10', main: false })
  ext.costs = [
    { value: 186, validFrom: '2026-08-01', createdBy: 'Carga inicial', reason: 'Custo de partida do cadastro' },
    { value: 192, validFrom: '2026-11-01', createdBy: 'Paulo Mendes', reason: 'Reajuste da placa pogo pin negociado com a EletroSul' },
  ]
  ext.benefits = [{ id: 'BF-1', uf: 'MG', kind: 'Crédito presumido de ICMS', legalBasis: 'RICMS/MG, Anexo IV (referência de demonstração)', validTo: '2027-12-31' }]
  ext.reform = [
    { id: 'RT-1', cClassTrib: '000001', ibsReduction: 0, cbsReduction: 0, validFrom: '2026-01-01', createdBy: 'Patrícia Melo' },
    { id: 'RT-2', cClassTrib: '200032', ibsReduction: 60, cbsReduction: 60, validFrom: '2027-01-01', createdBy: 'Patrícia Melo' },
  ]
  catalogOf('cp-placa').exTipi = '01'

  const tags: [string, string, string, string[], [number, number, number]][] = [
    ['pa-a11-ext', 'Roboflex Hard', 'Extreme', ['Cases robustos', 'Samsung', 'Logística'], [32, 24, 6]],
    ['pa-a11-imp', 'Roboflex Hard', 'Impact', ['Cases robustos', 'Samsung'], [30, 22, 4]],
    ['pa-s9-min', 'Roboflex Hard', 'Mining', ['Cases robustos', 'Samsung', 'Mineração'], [34, 25, 7]],
    ['pa-lite-ipad', 'Roboflex Lite', 'Mesas', ['Suportes de mesa', 'Apple', 'Varejo'], [40, 30, 12]],
    ['kf-frota', 'Roboflex Hard', 'Impact', ['Kits corporativos', 'Logística'], [62, 46, 24]],
    ['kt-vitrine', 'Roboflex Hard', 'Impact', ['Kits de vitrine', 'Varejo'], [0, 0, 0]],
  ]
  for (const [id, brand, line, categories, [length, width, height]] of tags) {
    Object.assign(catalogOf(id), { brand, productLine: line, categories, lengthCm: length, widthCm: width, heightCm: height })
  }
  for (const item of s.items) {
    if (item.type === '04' && !item.moldId) item.catalog!.productionLeadDays = 3
    if (item.moldId) item.catalog!.productionLeadDays = 1
  }
  Object.assign(catalogOf('mp-abs'), { minLot: 100, lotMultiple: 25 })
  Object.assign(catalogOf('cp-paraf'), { minLot: 1000, lotMultiple: 1000 })
  Object.assign(catalogOf('em-hard'), { minLot: 100, lotMultiple: 50, lengthCm: 36, widthCm: 28, heightCm: 9 })

  ext.media = [
    { id: 'MD-1', kind: 'Foto', name: 'case-extreme-frente.svg', dataUrl: sketch('Case Extreme · Tab A11', '#1F2A36'), size: 1200, order: 1, main: true, uploadedBy: 'Eduardo Freitas', uploadedAt: '2026-08-02T10:00:00.000Z' },
    { id: 'MD-2', kind: 'Desenho', name: 'DES-A11-EXT-revC.pdf', size: 184000, order: 2, main: false, uploadedBy: 'Eduardo Freitas', uploadedAt: '2026-08-02T10:05:00.000Z' },
    { id: 'MD-3', kind: 'Ficha técnica', name: 'FT-Case-Extreme.pdf', size: 92000, order: 3, main: false, uploadedBy: 'Camila Duarte', uploadedAt: '2026-08-03T09:00:00.000Z' },
  ]
  catalogOf('pa-a11-imp').media = [
    { id: 'MD-4', kind: 'Foto', name: 'case-impact-preto.svg', dataUrl: sketch('Case Impact · Preto', '#2B2F33'), size: 1100, order: 1, main: true, uploadedBy: 'Camila Duarte', uploadedAt: '2026-08-04T10:00:00.000Z' },
  ]
  catalogOf('pa-s9-min').media = [
    { id: 'MD-5', kind: 'Foto', name: 'case-mining-prototipo.svg', dataUrl: sketch('Case Mining · protótipo', '#C86B12'), size: 1150, order: 1, main: true, uploadedBy: 'Eduardo Freitas', uploadedAt: '2026-10-10T10:00:00.000Z' },
  ]
  catalogOf('pa-s9-min').projectLinks = [
    { projectId: 'PRJ-26-014', milestoneId: 'm2', note: 'Base do case S10: reaproveita a borda e muda o encaixe da câmera', linkedBy: 'Eduardo Freitas', linkedAt: '2026-09-16T10:00:00.000Z' },
  ]
  catalogOf('se-tampa-s9').projectLinks = [
    { projectId: 'PRJ-26-014', milestoneId: 'm2', note: 'Molde da tampa precisa de ajuste de 0,3 mm', linkedBy: 'Eduardo Freitas', linkedAt: '2026-09-16T10:05:00.000Z' },
  ]

  s.itemModels.push({
    id: 'GR-1', name: 'Case Impact Tab A11', templateId: 'pa-a11-imp', createdBy: 'Eduardo Freitas', createdAt: '2026-08-05T10:00:00.000Z',
    axes: [{ name: 'Cor', values: ['Preto', 'Laranja segurança', 'Azul petróleo'] }],
  })
  s.counters.GR = 1
  Object.assign(catalogOf('pa-a11-imp'), { modelId: 'GR-1', attributes: { Cor: 'Preto' } })

  prepareEngineering(s)
}

/** Atributos por classe, ferramental, embalagem logística, mudanças de engenharia e fiscal em mão dupla. */
function prepareEngineering(s: ErpState) {
  const catalogOf = (id: string) => s.items.find(item => item.id === id)!.catalog!
  const node = (path: string[]) => s.itemClasses.find(entry => entry.id === ensureClassPath(s, path))!

  node(['Produtos acabados']).attributes = [
    { key: 'Linha', label: 'Linha', kind: 'Lista', options: ['Hard', 'Lite'], required: true },
    { key: 'Modelo de device', label: 'Modelo de device', kind: 'Texto', required: true },
    { key: 'Fixação', label: 'Fixação', kind: 'Lista', options: ['Mão', 'Veicular', 'Mesa', 'Parede'], required: false },
    { key: 'Cor', label: 'Cor', kind: 'Lista', options: ['Preto', 'Laranja segurança', 'Azul petróleo'], required: true, variantAxis: true },
  ]
  node(['Produtos acabados', 'Linha Hard', 'Cases']).attributes = [
    { key: 'Grau de proteção', label: 'Grau de proteção', kind: 'Lista', options: ['IP54', 'IP65', 'IP67'], required: true },
    { key: 'Altura de queda', label: 'Altura de queda', kind: 'Número', unit: 'm', required: false },
  ]
  const families: Record<string, string[]> = {
    CASE: ['Fixação', 'Conexões', 'Câmera', 'Botões', 'Áudio', 'Sensor', 'Armazenamento'],
    CONSOLE: ['Sinal', 'Tamanho', 'Iluminação', 'Linha', 'Processamentos'],
    BASE: ['Modelo', 'Fixação', 'Tamanho', 'Cores'],
    'BRAÇO': ['Modelo', 'Tamanho', 'Cores', 'Modelo por instalação'],
    CARREGADOR: ['Faixa de tensão de entrada', 'Faixa de tensão de saída', 'Corrente de saída', 'Cabo de saída', 'Capacidade de carga'],
    HUB: ['Modelo', 'Conexões', 'Saída', 'Versão', 'Fixação'],
    PLUG: ['Entrada', 'Saída', 'Linha'],
    ADAPTADOR: ['Saída', 'Tamanho'],
    CABO: ['Conexões', 'Modelo'],
    DOCA: ['Tamanho', 'Conexões', 'Fixação'],
    'ACESSÓRIO': ['Modelo', 'Versão'],
  }
  for (const [name, labels] of Object.entries(families)) {
    const id = ensureClassPath(s, ['Produtos acabados', name])
    const created = s.itemClasses.find(entry => entry.id === id)
    if (created) created.attributes = labels.map(label => ({ key: label, label, kind: 'Texto' as const, required: false }))
  }
  for (const name of ['Matéria-prima', 'Produto em processo', 'Produto acabado', 'Componente', 'Embalagem', 'Consumível', 'Peça de reposição', 'Equipamento']) {
    ensureClassPath(s, ['Taxonomia proposta', name])
  }
  node(['Peças injetadas']).attributes = [
    { key: 'Peso da peça', label: 'Peso da peça', kind: 'Número', unit: 'g', required: true },
    { key: 'Acabamento', label: 'Acabamento', kind: 'Lista', options: ['Texturizado', 'Liso', 'Brilhante'], required: false },
  ]
  const values: Record<string, Record<string, string>> = {
    'pa-a11-ext': { Linha: 'Hard', 'Modelo de device': 'Samsung Galaxy Tab A11', Fixação: 'Mão', Cor: 'Preto', 'Grau de proteção': 'IP65', 'Altura de queda': '1,8' },
    'pa-a11-imp': { Linha: 'Hard', 'Modelo de device': 'Samsung Galaxy Tab A11', Fixação: 'Mão', Cor: 'Preto', 'Grau de proteção': 'IP54', 'Altura de queda': '1,2' },
    'pa-s9-min': { Linha: 'Hard', 'Modelo de device': 'Samsung Galaxy Tab S9 FE', Cor: 'Preto' },
    'pa-lite-ipad': { Linha: 'Lite', 'Modelo de device': 'Apple iPad 10ª geração', Fixação: 'Mesa', Cor: 'Preto' },
    'se-mold-a11': { 'Peso da peça': '107', Acabamento: 'Texturizado' },
    'se-tampa-a11': { 'Peso da peça': '155', Acabamento: 'Texturizado' },
    'se-bump-a11': { 'Peso da peça': '78' },
    'se-mold-s9': { 'Peso da peça': '126' },
    'se-tampa-s9': { 'Peso da peça': '184' },
    'se-base-lite': { 'Peso da peça': '214', Acabamento: 'Brilhante' },
  }
  for (const [id, entry] of Object.entries(values)) catalogOf(id).attributes = { ...catalogOf(id).attributes, ...entry }

  const molds: [string, string, number, number, number, number, string[], 'Roboflex' | 'Cliente', number, string?][] = [
    ['fe-m112', 'mold-a11f', 2, 2, 42, 228, ['inj1', 'inj2'], 'Roboflex', 1_000_000],
    ['fe-m113', 'mold-a11t', 1, 1, 48, 163, ['inj2'], 'Roboflex', 800_000],
    ['fe-m114', 'mold-a11b', 4, 2, 55, 166, ['inj3'], 'Roboflex', 600_000],
    ['fe-m121', 'mold-s9f', 2, 2, 46, 266, ['inj2', 'inj3'], 'Cliente', 500_000, 'Mineradora Horizonte'],
    ['fe-m122', 'mold-s9t', 1, 1, 52, 196, ['inj1'], 'Cliente', 500_000, 'Mineradora Horizonte'],
    ['fe-m090', 'mold-lite', 1, 1, 38, 226, ['inj1'], 'Roboflex', 250_000],
  ]
  for (const [id, assetId, cavities, activeCavities, cycleSeconds, shotWeightG, compatibleResourceIds, owner, lifeShots, ownerName] of molds) {
    const value = s.items.find(item => item.id === id)!.cost
    catalogOf(id).tooling = { kind: 'Molde', cavities, activeCavities, cycleSeconds, shotWeightG, compatibleResourceIds, owner, ownerName, assetId, lifeShots, value }
  }
  catalogOf('fe-g11').tooling = { kind: 'Gabarito', cavities: 1, activeCavities: 1, cycleSeconds: 0, shotWeightG: 0, compatibleResourceIds: ['mont1', 'mont2'], owner: 'Roboflex', lifeShots: 0, value: 4200 }
  catalogOf('fe-m114').media = [
    { id: 'MD-6', kind: 'Desenho', name: 'M-114-cavidades-3-4-bloqueadas.pdf', size: 220000, order: 1, main: false, uploadedBy: 'Diego Martins', uploadedAt: '2026-09-28T10:00:00.000Z' },
  ]

  const ext = catalogOf('pa-a11-ext')
  ext.packaging = [
    { level: 'Unidade', units: 1, packageItemId: 'em-hard', gtin: ext.gtin, weightKg: 0.86, lengthCm: 36, widthCm: 28, heightCm: 9 },
    { level: 'Caixa', units: 10, gtin: ext.barcodes.find(entry => entry.kind === 'DUN-14')?.code, weightKg: 9.4, lengthCm: 58, widthCm: 38, heightCm: 46 },
    { level: 'Palete', units: 400, weightKg: 395, lengthCm: 120, widthCm: 100, heightCm: 150 },
  ]
  catalogOf('pa-a11-imp').packaging = [
    { level: 'Unidade', units: 1, packageItemId: 'em-hard', weightKg: 0.62, lengthCm: 36, widthCm: 28, heightCm: 9 },
    { level: 'Caixa', units: 12, weightKg: 8, lengthCm: 58, widthCm: 38, heightCm: 52 },
  ]
  for (const media of ext.media) if (media.kind !== 'Foto') Object.assign(media, { revisionCode: 'C', sendToOp: media.kind === 'Desenho' })

  s.engineeringChanges = [
    {
      id: 'ECO-0001', title: 'Vedação portuária no Case Extreme', reason: 'Porto Leste relatou entrada de maresia pelo perímetro da moldura. Incluir junta de EPDM e reforçar fixação com 10 parafusos.',
      priority: 'Urgente', stage: 'Em análise', itemIds: ['pa-a11-ext'], disposition: 'Usar até acabar', effectiveDate: '2026-11-03',
      requestedBy: 'Camila Nunes', requestedAt: '2026-10-12T15:00:00.000Z', opportunityId: 'OPP-26045',
      history: [
        { at: '2026-10-13T10:00:00.000Z', actor: 'Eduardo Freitas', text: 'Versão D de RF-H-A11-EXT vinculada' },
        { at: '2026-10-13T09:40:00.000Z', actor: 'Eduardo Freitas', text: 'Solicitada → Em análise' },
        { at: '2026-10-12T15:00:00.000Z', actor: 'Camila Nunes', text: 'Mudança solicitada' },
      ],
    },
    {
      id: 'ECO-0002', title: 'Voltar o molde M-114 para 4 cavidades', reason: 'Cavidades 3 e 4 bloqueadas desde setembro por rebarba. Ferramentaria propõe recuperar os insertos e dobrar a produção do bumper.',
      priority: 'Normal', stage: 'Solicitada', itemIds: ['fe-m114', 'se-bump-a11'], disposition: 'Sem estoque', effectiveDate: '2026-11-20',
      requestedBy: 'Diego Martins', requestedAt: '2026-10-15T11:00:00.000Z',
      history: [{ at: '2026-10-15T11:00:00.000Z', actor: 'Diego Martins', text: 'Mudança solicitada' }],
    },
    {
      id: 'ECO-0003', title: 'Reforço do alojamento do conector', reason: 'Quebra do alojamento em queda de 1,5 m. Reforço com nervura e alça incluída na caixa.',
      priority: 'Normal', stage: 'Implementada', itemIds: ['pa-a11-ext'], disposition: 'Retrabalhar', effectiveDate: '2026-08-10',
      requestedBy: 'André Silva', requestedAt: '2026-07-20T10:00:00.000Z', approvedBy: 'Eduardo Freitas', approvedAt: '2026-08-05T10:00:00.000Z', implementedAt: '2026-08-10T14:00:00.000Z',
      history: [
        { at: '2026-08-10T14:00:00.000Z', actor: 'Eduardo Freitas', text: 'Aprovada → Implementada' },
        { at: '2026-08-05T10:00:00.000Z', actor: 'Eduardo Freitas', text: 'Em análise → Aprovada' },
        { at: '2026-07-20T10:00:00.000Z', actor: 'André Silva', text: 'Mudança solicitada' },
      ],
    },
  ]
  s.counters.ECO = 3
  s.counters.DM = 107
  s.counters.OPP = 26046

  const at = '2026-10-18T09:00:00.000Z'
  catalogOf('pa-a11-imp').fiscalSync = { status: 'Enviar ao Omie', at, by: 'Patrícia Melo' }
  const board = catalogOf('cp-placa')
  board.fiscalSync = { status: 'Conflito', at, by: 'Omie', remote: { ncm: board.ncm, cest: board.cest, origin: '1', exTipi: '02', cClassTrib: board.cClassTrib } }
}
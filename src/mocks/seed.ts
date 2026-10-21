import {
  addSyncLog, advanceRequisition, approveInspection, confirmShipment, createMaintenance, finishOperation, invoiceOrder,
  pauseOperation, pickOp, planOrder, raiseAlert, rejectInspection, reportProduction, setClock, shipOrder,
  startOperation, updateNonConformity, type ErpState,
} from '../domain/engine'
import { defaultCatalog, ensureClassPath, seedPath, withCheckDigit } from '../domain/catalog'
import { FUNCTIONALITIES, profileCode, seededProfiles } from '../domain/access'
import type { Item, SalesOrder } from '../types/domain'

const mp = (id: string, code: string, name: string, stock: number, minimum: number, cost: number, supplier: string, leadTimeDays: number): Item =>
  ({ id, code, name, type: 'MP', unit: 'kg', stock, minimum, cost, supplier, leadTimeDays, location: 'Silo / A-01' })

const cp = (id: string, code: string, name: string, stock: number, minimum: number, cost: number, supplier: string, leadTimeDays: number, type: 'CP' | 'EM' = 'CP'): Item =>
  ({ id, code, name, type, unit: 'un', stock, minimum, cost, supplier, leadTimeDays, location: type === 'EM' ? 'Estoque C-04' : 'Almox B-02' })

const se = (id: string, code: string, name: string, stock: number, moldId: string, cycleSeconds: number, cavities: number, resin: string, resinKg: number): Item =>
  ({ id, code, name, type: 'SE', unit: 'un', stock, minimum: 50, cost: 6, moldId, cycleSeconds, cavities, bom: [{ itemId: resin, quantity: resinKg, loss: 3 }], location: 'Supermercado injeção' })

const step = (id: string, name: string, resourceId: string, minutesPerUnit: number, instructions: string[]) => ({ id, name, resourceId, minutesPerUnit, instructions })

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
      { id: 'inj1', name: 'Injetora 01 · 180 t', kind: 'Injetora', dailyMinutes: 960 },
      { id: 'inj2', name: 'Injetora 02 · 250 t', kind: 'Injetora', dailyMinutes: 960 },
      { id: 'inj3', name: 'Injetora 03 · 350 t', kind: 'Injetora', dailyMinutes: 960 },
      { id: 'mont1', name: 'Montagem · Célula 1', kind: 'Montagem', dailyMinutes: 880 },
      { id: 'mont2', name: 'Montagem · Célula 2', kind: 'Montagem', dailyMinutes: 880 },
      { id: 'elet', name: 'Eletrônica e testes', kind: 'Montagem', dailyMinutes: 440 },
      { id: 'alm', name: 'Almoxarifado', kind: 'Almoxarifado', dailyMinutes: 880 },
      { id: 'qual', name: 'Qualidade', kind: 'Qualidade', dailyMinutes: 440 },
      { id: 'exp', name: 'Expedição', kind: 'Expedição', dailyMinutes: 440 },
    ],
    assets: [
      { id: 'a-inj1', name: 'Injetora 01 · Haitian 180 t', kind: 'Injetora', resourceId: 'inj1', nextPreventive: '2026-10-28' },
      { id: 'a-inj2', name: 'Injetora 02 · Romi 250 t', kind: 'Injetora', resourceId: 'inj2', nextPreventive: '2026-11-04' },
      { id: 'a-inj3', name: 'Injetora 03 · Romi 350 t', kind: 'Injetora', resourceId: 'inj3', nextPreventive: '2026-10-20' },
      { id: 'mold-a11f', name: 'Molde M-112 · Moldura A11', kind: 'Molde', resourceId: 'inj1', shots: 182400, nextPreventive: '2026-10-25' },
      { id: 'mold-a11t', name: 'Molde M-113 · Tampa A11', kind: 'Molde', resourceId: 'inj2', shots: 96500, nextPreventive: '2026-11-10' },
      { id: 'mold-a11b', name: 'Molde M-114 · Bumper A11', kind: 'Molde', resourceId: 'inj3', shots: 64200, nextPreventive: '2026-11-18' },
      { id: 'mold-s9f', name: 'Molde M-121 · Moldura S9 FE', kind: 'Molde', resourceId: 'inj2', shots: 41800, nextPreventive: '2026-12-01' },
      { id: 'mold-s9t', name: 'Molde M-122 · Tampa S9 FE', kind: 'Molde', resourceId: 'inj1', shots: 39700, nextPreventive: '2026-12-01' },
      { id: 'mold-lite', name: 'Molde M-090 · Base Mesa Lite', kind: 'Molde', resourceId: 'inj1', shots: 228000, preventiveLimit: 228020, nextPreventive: '2026-10-18' },
      { id: 'a-teste', name: 'Bancada de teste de estanqueidade', kind: 'Equipamento', resourceId: 'elet', nextPreventive: '2026-11-30' },
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
      cp('em-hard', 'EM-CX-07', 'Caixa individual Linha Hard', 420, 100, 3.2, 'Pack BH', 4, 'EM'),
      cp('em-lite', 'EM-CX-02', 'Caixa individual Linha Lite', 80, 50, 2.1, 'Pack BH', 4, 'EM'),
      se('se-mold-a11', 'SE-MLD-A11', 'Moldura frontal Tab A11', 110, 'mold-a11f', 42, 2, 'mp-abs', 0.11),
      se('se-tampa-a11', 'SE-TMP-A11', 'Tampa traseira Tab A11', 200, 'mold-a11t', 48, 1, 'mp-abs', 0.16),
      se('se-bump-a11', 'SE-BMP-A11', 'Bumper TPU Tab A11', 100, 'mold-a11b', 55, 2, 'mp-tpu', 0.08),
      se('se-mold-s9', 'SE-MLD-S9', 'Moldura frontal Tab S9 FE', 0, 'mold-s9f', 46, 2, 'mp-abs', 0.13),
      se('se-tampa-s9', 'SE-TMP-S9', 'Tampa traseira Tab S9 FE', 64, 'mold-s9t', 52, 1, 'mp-abs', 0.19),
      se('se-base-lite', 'SE-BAS-LT', 'Base Mesa Lite iPad', 70, 'mold-lite', 38, 1, 'mp-pc', 0.22),
      {
        id: 'pa-a11-ext', code: 'RF-H-A11-EXT', name: 'Case Extreme', variant: 'Samsung Tab A11', family: 'Hard', revision: 'C', type: 'PA', unit: 'un', stock: 0, minimum: 0, cost: 186, location: 'Expedição E-01',
        bom: [{ itemId: 'se-mold-a11', quantity: 1 }, { itemId: 'se-tampa-a11', quantity: 1 }, { itemId: 'se-bump-a11', quantity: 1 }, { itemId: 'cp-cabo', quantity: 1 }, { itemId: 'cp-placa', quantity: 1 }, { itemId: 'cp-pelic', quantity: 1 }, { itemId: 'cp-paraf', quantity: 8 }, { itemId: 'cp-alca', quantity: 1 }, { itemId: 'em-hard', quantity: 1 }],
        routing: [
          step('mec', 'Montagem mecânica', 'mont1', 6, ['Encaixar tablet de teste no gabarito G-11', 'Fixar moldura com 8 parafusos (torque 0,4 N·m)', 'Aplicar película sem bolhas']),
          step('ele', 'Instalação elétrica', 'elet', 5, ['Instalar placa pogo pin', 'Passar cabo USB-C pelo canal lateral', 'Conferir polaridade com multímetro']),
          step('tst', 'Teste funcional', 'elet', 2, ['Testar carregamento por 60 s', 'Registrar falhas no tablet']),
          step('emb', 'Embalagem', 'mont1', 1.5, ['Inserir alça e manual', 'Etiquetar caixa com lote da OP']),
        ],
      },
      {
        id: 'pa-a11-imp', code: 'RF-H-A11-IMP', name: 'Case Impact', variant: 'Samsung Tab A11', family: 'Hard', revision: 'B', type: 'PA', unit: 'un', stock: 0, minimum: 0, cost: 112, location: 'Expedição E-01',
        bom: [{ itemId: 'se-mold-a11', quantity: 1 }, { itemId: 'se-tampa-a11', quantity: 1 }, { itemId: 'se-bump-a11', quantity: 1 }, { itemId: 'cp-pelic', quantity: 1 }, { itemId: 'cp-paraf', quantity: 6 }, { itemId: 'em-hard', quantity: 1 }],
        routing: [
          step('mec', 'Montagem mecânica', 'mont2', 4, ['Encaixar bumper na tampa traseira', 'Fixar moldura com 6 parafusos', 'Aplicar película']),
          step('emb', 'Embalagem', 'mont2', 1, ['Etiquetar caixa com lote da OP']),
        ],
      },
      {
        id: 'pa-s9-min', code: 'RF-H-S9-MIN', name: 'Case Mining', variant: 'Galaxy Tab S9 FE', family: 'Hard', revision: 'A', type: 'PA', unit: 'un', stock: 0, minimum: 0, cost: 238, location: 'Expedição E-02',
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
        id: 'pa-lite-ipad', code: 'RF-L-IP10-MSA', name: 'Mesa Lite', variant: 'iPad 10ª geração', family: 'Lite', revision: 'A', type: 'PA', unit: 'un', stock: 0, minimum: 0, cost: 96, location: 'Expedição E-03',
        bom: [{ itemId: 'se-base-lite', quantity: 1 }, { itemId: 'cp-suporte', quantity: 1 }, { itemId: 'cp-paraf', quantity: 4 }, { itemId: 'em-lite', quantity: 1 }],
        routing: [
          step('mec', 'Montagem do suporte', 'mont2', 3, ['Fixar suporte articulado na base', 'Testar giro de 360°']),
          step('emb', 'Embalagem', 'mont2', 1, ['Etiquetar caixa Linha Lite']),
        ],
      },
      mp('mp-abs-cinza', 'RF-10001', 'ABS cinza UV', 0, 0, 19, 'Polímeros Minas', 5),
      cp('cp-pelic-11', 'RF-10002', 'Película de vidro 11"', 0, 0, 11, 'GlassTech', 12),
      { id: 'sv-campo', code: 'RF-10003', name: 'Visita técnica em campo', type: 'SV', unit: 'h', stock: 0, minimum: 0, cost: 280, location: '—' },
      {
        id: 'kt-vitrine', code: 'RF-10004', name: 'Kit vitrine Impact', type: 'KT', unit: 'un', stock: 0, minimum: 0, cost: 0, location: '—',
        bom: [{ itemId: 'pa-a11-imp', quantity: 1 }, { itemId: 'cp-pelic', quantity: 2 }],
      },
      {
        id: 'kf-frota', code: 'RF-10006', name: 'Kit frota Impact', type: 'KF', unit: 'kit', stock: 0, minimum: 0, cost: 0, location: 'Expedição E-01',
        bom: [{ itemId: 'pa-a11-imp', quantity: 5 }, { itemId: 'em-hard', quantity: 1 }],
        routing: [step('kit', 'Montagem do kit', 'mont2', 2, ['Conferir 5 cases Impact', 'Embalar na caixa master', 'Etiquetar kit'])],
      },
      { id: 'im-rack', code: 'RF-10005', name: 'Rack de carga portuário', type: 'IM', unit: 'un', stock: 1, minimum: 0, cost: 2400, location: 'Expedição' },
    ],
    users: [
      { id: 'u-master', name: 'Mestre da plataforma', role: 'Administrador', sector: 'Plataforma', shift: 'Administrativo', pin: '9000', email: 'plataforma@thalamus.local', active: true, platformMaster: true },
      { id: 'u16', name: 'Lucas Lima', role: 'Administrador', sector: 'Diretoria industrial', shift: 'Administrativo', pin: '0000', email: 'lucas.lima@roboflex.com.br', active: true },
      { id: 'u1', name: 'Marina Souza', role: 'Gestor', sector: 'Diretoria industrial', shift: 'Administrativo', pin: '1111', email: 'marina@roboflex.com.br', active: true },
      { id: 'u1', name: 'Marina Souza', role: 'Gestor', sector: 'Diretoria industrial', shift: 'Administrativo', pin: '1111', email: 'marina@roboflex.com.br', active: true },
      { id: 'u12', name: 'Camila Nunes', role: 'Comercial', sector: 'Comercial', shift: 'Administrativo', pin: '1212', email: 'camila@roboflex.com.br', positionId: 'pos-com', active: true },
      { id: 'u13', name: 'Eduardo Freitas', role: 'Engenharia', sector: 'Engenharia', shift: 'Administrativo', pin: '1313', email: 'eduardo@roboflex.com.br', positionId: 'pos-eng', active: true },
      { id: 'u14', name: 'Patrícia Melo', role: 'Financeiro', sector: 'Financeiro', shift: 'Administrativo', pin: '1414', email: 'patricia@roboflex.com.br', positionId: 'pos-fin', active: true },
      { id: 'u15', name: 'André Silva', role: 'Assistência', sector: 'Assistência técnica', shift: 'Administrativo', pin: '1515', email: 'andre@roboflex.com.br', positionId: 'pos-ast', active: true },
      { id: 'u2', name: 'Paulo Mendes', role: 'PCP', sector: 'Planejamento', shift: 'Administrativo', pin: '2222' },
      { id: 'u3', name: 'Juliana Reis', role: 'Compras', sector: 'Suprimentos', shift: 'Administrativo', pin: '3333' },
      { id: 'u4', name: 'Carlos Lima', role: 'Almoxarifado', sector: 'Almoxarifado', shift: 'Manhã', pin: '4444' },
      { id: 'u5', name: 'Bruno Alves', role: 'Líder de produção', sector: 'Produção', shift: 'Manhã', pin: '5555' },
      { id: 'u6', name: 'João Pereira', role: 'Operador', sector: 'Injeção', shift: 'Manhã', pin: '1234' },
      { id: 'u7', name: 'Ana Costa', role: 'Operador', sector: 'Montagem', shift: 'Manhã', pin: '1234' },
      { id: 'u8', name: 'Lucas Ferreira', role: 'Operador', sector: 'Injeção', shift: 'Tarde', pin: '1234' },
      { id: 'u9', name: 'Fernanda Rocha', role: 'Qualidade', sector: 'Qualidade', shift: 'Manhã', pin: '6666' },
      { id: 'u10', name: 'Rafael Souza', role: 'Expedição', sector: 'Logística', shift: 'Manhã', pin: '7777' },
      { id: 'u11', name: 'Diego Martins', role: 'Manutenção', sector: 'Manutenção', shift: 'Manhã', pin: '8888' },
    ],
    sectors: [
      { id: 'sec-dir', name: 'Diretoria industrial', costCenter: 'CC-100' },
      { id: 'sec-com', name: 'Comercial', managerId: 'u12', parentId: 'sec-dir', costCenter: 'CC-210' },
      { id: 'sec-eng', name: 'Engenharia', managerId: 'u13', parentId: 'sec-dir', costCenter: 'CC-310' },
      { id: 'sec-sup', name: 'Suprimentos', managerId: 'u3', parentId: 'sec-dir', costCenter: 'CC-320' },
      { id: 'sec-pro', name: 'Operações', managerId: 'u5', parentId: 'sec-dir', costCenter: 'CC-400' },
      { id: 'sec-ser', name: 'Serviços', managerId: 'u11', parentId: 'sec-dir', costCenter: 'CC-500' },
      { id: 'sec-fin', name: 'Financeiro', managerId: 'u14', parentId: 'sec-dir', costCenter: 'CC-600' },
    ],
    positions: [
      { id: 'pos-com', name: 'Executiva comercial', sectorId: 'sec-com', description: 'CRM, propostas e carteira de clientes' },
      { id: 'pos-eng', name: 'Engenheiro de produto', sectorId: 'sec-eng', description: 'Produto, estrutura, roteiro e revisão' },
      { id: 'pos-fin', name: 'Analista financeiro', sectorId: 'sec-fin', description: 'Orçamentos e títulos operacionais' },
      { id: 'pos-ast', name: 'Técnico de campo', sectorId: 'sec-ser', description: 'Triagem e execução de assistência' },
      { id: 'pos-op', name: 'Operador industrial', sectorId: 'sec-pro', description: 'Apontamento e autocontrole' },
    ],
    partners: [
      { id: 'c1', name: 'Mineradora Horizonte', document: '12.345.678/0001-10', roles: ['Cliente'], city: 'Itabira, MG', contact: 'Marcelo Dias', email: 'marcelo@horizonte.com.br', status: 'Ativo' },
      { id: 'c2', name: 'Translog Brasil', document: '23.456.789/0001-20', roles: ['Cliente', 'Transportadora'], city: 'Contagem, MG', contact: 'Bianca Alves', email: 'bianca@translog.com.br', status: 'Ativo' },
      { id: 'c3', name: 'Agro Vale Verde', document: '34.567.890/0001-30', roles: ['Cliente'], city: 'Rio Verde, GO', contact: 'Rui Prado', email: 'rui@agrovale.com.br', status: 'Ativo' },
      { id: 'c4', name: 'Hotel Serra Azul', document: '45.678.901/0001-40', roles: ['Cliente'], city: 'Gramado, RS', contact: 'Lívia Costa', email: 'livia@serraazul.com.br', status: 'Ativo' },
      { id: 'c5', name: 'Porto Leste', document: '56.789.012/0001-50', roles: ['Cliente'], city: 'Vitória, ES', contact: 'Fábio Luz', email: 'fabio@portoleste.com.br', status: 'Ativo' },
      { id: 'c6', name: 'Rede Varejo Prime', document: '67.890.123/0001-60', roles: ['Cliente'], city: 'São Paulo, SP', contact: 'Nina Lopes', email: 'nina@varejoprime.com.br', status: 'Ativo' },
      { id: 'f1', name: 'Polímeros Minas', document: '71.111.111/0001-11', roles: ['Fornecedor'], city: 'Betim, MG', contact: 'César Mota', email: 'vendas@polimerosminas.com.br', status: 'Ativo' },
      { id: 'f2', name: 'TecnoPoli', document: '72.222.222/0001-22', roles: ['Fornecedor'], city: 'Campinas, SP', contact: 'Bia Lima', email: 'bia@tecnopoli.com.br', status: 'Ativo' },
      { id: 'f3', name: 'EletroSul Componentes', document: '73.333.333/0001-33', roles: ['Fornecedor'], city: 'Joinville, SC', contact: 'Luiz Reis', email: 'luiz@eletrosul.com.br', status: 'Ativo' },
    ],
    productRevisions: [
      { id: 'rev-a11-c', itemId: 'pa-a11-ext', code: 'C', status: 'Liberada', createdAt: '2026-08-02T10:00:00.000Z', releasedAt: '2026-08-10T14:00:00.000Z', releasedBy: 'Eduardo Freitas', checklist: [{ label: 'Cadastro', done: true }, { label: 'Estrutura', done: true }, { label: 'Roteiro', done: true }, { label: 'Fiscal', done: true }], notes: 'Reforço do alojamento do conector.' },
      { id: 'rev-a11-d', itemId: 'pa-a11-ext', code: 'D', status: 'Rascunho', createdAt: '2026-10-13T10:00:00.000Z', checklist: [{ label: 'Cadastro', done: true }, { label: 'Estrutura', done: true }, { label: 'Roteiro', done: false }, { label: 'Fiscal', done: true }], notes: 'Nova vedação para uso portuário.' },
      { id: 'rev-impact-b', itemId: 'pa-a11-imp', code: 'B', status: 'Liberada', createdAt: '2026-07-01T10:00:00.000Z', releasedAt: '2026-07-09T10:00:00.000Z', releasedBy: 'Eduardo Freitas', checklist: [{ label: 'Cadastro', done: true }, { label: 'Estrutura', done: true }, { label: 'Roteiro', done: true }], notes: 'Versão vigente.' },
    ],
    services: [
      { id: 'sv-mont', code: 'SV-PRO-001', name: 'Montagem mecânica de case', category: 'Produção', unit: 'hora', standardMinutes: 60, cost: 52, price: 0, outsourced: false, status: 'Ativo' },
      { id: 'sv-prev', code: 'SV-MAN-002', name: 'Preventiva em injetora', category: 'Manutenção', unit: 'hora', standardMinutes: 180, cost: 95, price: 0, outsourced: false, status: 'Ativo' },
      { id: 'sv-campo', code: 'SV-AST-003', name: 'Visita técnica em campo', category: 'Assistência', unit: 'visita', standardMinutes: 240, cost: 320, price: 480, outsourced: false, status: 'Ativo' },
      { id: 'sv-lab', code: 'SV-TER-004', name: 'Ensaio IP65 em laboratório', category: 'Terceiro', unit: 'un', standardMinutes: 0, cost: 850, price: 1200, outsourced: true, status: 'Ativo' },
    ],
    demands: [
      { id: 'DM-104', kind: 'Material', itemId: 'mp-tpu', description: 'TPU para OP urgente', quantity: 38, origin: 'OP', originId: 'OP-24035', neededBy: '2026-10-18', priority: 'Urgente', status: 'Em atendimento', assigneeRole: 'Compras', requester: 'u5', purchaseOrderId: 'PC-7310', supplierId: 'f2', estimatedCost: 1660, notes: 'Sem TPU a OP de montagem para no dia 18.', createdAt: '2026-10-15T07:30:00.000Z' },
      { id: 'DM-103', kind: 'Serviço', serviceId: 'sv-lab', description: 'Ensaio externo do projeto Mining S10', quantity: 1, origin: 'Projeto', originId: 'PRJ-26-014', neededBy: '2026-10-24', priority: 'Alta', status: 'Em atendimento', assigneeRole: 'Compras', requester: 'u13', projectId: 'PRJ-26-014', supplierId: 'f3', estimatedCost: 850, notes: 'Laboratório credenciado; ensaio IP65 com 6 amostras do protótipo.', createdAt: '2026-10-14T13:00:00.000Z' },
      { id: 'DM-102', kind: 'Material', itemId: 'cp-placa', description: 'Placa para assistência em garantia', quantity: 2, origin: 'Assistência', originId: 'AT-26018', neededBy: '2026-10-17', priority: 'Alta', status: 'Aberta', assigneeRole: 'Almoxarifado', requester: 'u15', estimatedCost: 64, createdAt: '2026-10-15T08:20:00.000Z' },
      { id: 'DM-105', kind: 'Serviço', serviceId: 'sv-prev', description: 'Revisão do cilindro da Injetora 03', quantity: 100, origin: 'Manutenção', neededBy: '2026-10-28', priority: 'Alta', status: 'Aberta', assigneeRole: 'Compras', requester: 'u11', estimatedCost: 9500, budgetCategoryId: 'BC-OPER', budgetPeriod: '2026-10', costCenter: 'CC-500', createdAt: '2026-10-18T09:00:00.000Z' },
      { id: 'DM-106', kind: 'Material', itemId: 'mp-abs', description: 'Baixa de lote reprovado na inspeção', quantity: 1, origin: 'Manual', neededBy: '2026-10-20', priority: 'Alta', status: 'Aberta', assigneeRole: 'Qualidade', requester: 'u11', estimatedCost: 150000, budgetCategoryId: 'BC-PERDAS', budgetPeriod: '2026-10', costCenter: 'CC-500', createdAt: '2026-10-19T09:00:00.000Z' },
    ],
    purchaseOrders: [
      { id: 'PC-7310', supplierId: 'f2', demandIds: ['DM-104'], itemId: 'mp-tpu', quantity: 40, received: 20, unitPrice: 41.5, promisedDate: '2026-10-17', status: 'Recebido parcial', quotes: [{ supplierId: 'f2', unitPrice: 41.5, leadDays: 2, selected: true }, { supplierId: 'f1', unitPrice: 39.8, leadDays: 7, selected: false }], budgetId: 'ORC-MAT-10', createdAt: '2026-10-14T14:00:00.000Z' },
    ],
    opportunities: [
      { id: 'OPP-26042', partnerId: 'c1', title: 'Renovação tablets mina Norte', ownerId: 'u12', stage: 'Negociação', value: 102194, probability: 75, nextAction: 'Revisar condição de entrega', expectedClose: '2026-10-22', source: 'Indicação', contact: 'Marcelo Dias', segment: 'Mineração', itemIds: ['pa-s9-min', 'pa-a11-ext'], quantity: 144, createdAt: '2026-09-22T10:00:00.000Z', notes: 'Troca de 120 tablets na mina Norte e 24 na usina. Cliente exige IP68 e entrega antes da parada de dezembro.', activities: [{ id: 'act-1', at: '2026-10-15T09:00:00.000Z', type: 'Reunião', text: 'Validação técnica com operação', done: true }] },
      { id: 'OPP-26043', partnerId: 'c5', title: 'Cases para coletores do pátio', ownerId: 'u12', stage: 'Proposta', value: 62400, probability: 55, nextAction: 'Apresentar protótipo', expectedClose: '2026-10-29', source: 'Site', contact: 'Fábio Luz', segment: 'Logística', itemIds: ['pa-a11-ext'], quantity: 60, createdAt: '2026-10-06T15:00:00.000Z', activities: [{ id: 'act-2', at: '2026-10-16T13:00:00.000Z', type: 'Tarefa', text: 'Enviar desenho da fixação', done: false }] },
      { id: 'OPP-26040', partnerId: 'c2', title: 'Padronização frota 2027', ownerId: 'u12', stage: 'Ganha', value: 49600, probability: 100, nextAction: 'Acompanhar primeiro lote', expectedClose: '2026-10-10', source: 'Carteira', contact: 'Bianca Alves', segment: 'Logística', itemIds: ['pa-a11-ext'], quantity: 80, createdAt: '2026-09-10T09:00:00.000Z', activities: [] },
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
    budgetCategories: [
      { id: 'BC-CMV', code: '03.01', name: 'Custo Mercadoria Vendida', group: '03. Custos', responsibleRole: 'Financeiro', status: 'Ativa', audit: [] },
      { id: 'BC-CMV-1', code: '03.01.01', name: 'Compras de Matéria Prima', group: '03. Custos', parentId: 'BC-CMV', responsibleRole: 'Compras', status: 'Ativa', audit: [] },
      { id: 'BC-CMV-2', code: '03.01.02', name: 'Compra de Serviços Terceirizados', group: '03. Custos', parentId: 'BC-CMV', responsibleRole: 'Compras', status: 'Ativa', audit: [] },
      { id: 'BC-CMV-3', code: '03.01.03', name: 'Compras de Mercadorias para Revenda', group: '03. Custos', parentId: 'BC-CMV', responsibleRole: 'Compras', status: 'Ativa', audit: [] },
      { id: 'BC-CMV-4', code: '03.01.04', name: 'Embalagens', group: '03. Custos', parentId: 'BC-CMV', responsibleRole: 'Compras', status: 'Ativa', audit: [] },
      { id: 'BC-CMV-5', code: '03.01.05', name: 'Materiais e Insumos para SaaS', group: '03. Custos', parentId: 'BC-CMV', responsibleRole: 'Financeiro', status: 'Ativa', audit: [] },
      { id: 'BC-OPER', code: '03.02', name: 'Custo Operacional', group: '03. Custos', responsibleRole: 'PCP', status: 'Ativa', audit: [] },
      { id: 'BC-DEPREC', code: '03.03', name: 'Custo Máquinas - Depreciação', group: '03. Custos', responsibleRole: 'Financeiro', status: 'Ativa', audit: [] },
      { id: 'BC-PESSOAL', code: '03.04', name: 'Custo de Pessoal', group: '03. Custos', responsibleRole: 'Financeiro', status: 'Ativa', audit: [] },
      { id: 'BC-VENDAS', code: '03.05', name: 'Custo com Vendas e Marketing', group: '03. Custos', responsibleRole: 'Comercial', status: 'Ativa', audit: [] },
      { id: 'BC-PD', code: '03.06', name: 'Custo com Pesquisa e Desenvolvimento', group: '03. Custos', responsibleRole: 'Engenharia', status: 'Ativa', audit: [] },
      { id: 'BC-MAT-PD', code: '03.07', name: 'Materiais Pesquisa e Desenvolvimento', group: '03. Custos', responsibleRole: 'Engenharia', status: 'Ativa', audit: [] },
      { id: 'BC-GARANTIA', code: '03.08', name: 'Custo com Garantia e Perdas', group: '03. Custos', responsibleRole: 'Assistência', status: 'Ativa', audit: [] },
      { id: 'BC-PERDAS', code: '03.09', name: 'Perdas', group: '03. Custos', responsibleRole: 'Qualidade', status: 'Ativa', audit: [] },
      { id: 'BC-IMPOSTOS', code: '02.01', name: 'Impostos e Taxas', group: '02. Deduções da Receita', responsibleRole: 'Financeiro', status: 'Ativa', audit: [] },
      { id: 'BC-DEVOL', code: '02.02', name: 'Devoluções e Reembolsos', group: '02. Deduções da Receita', responsibleRole: 'Financeiro', status: 'Ativa', audit: [] },
    ],
    budgets: [
      { id: 'ORC-CMV-10', categoryId: 'BC-CMV', period: '2026', amount: 2160000, alertThreshold: 80, blockOnOverrun: true, audit: [] },
      { id: 'ORC-CMV-1', categoryId: 'BC-CMV-1', period: '2026', amount: 432000, alertThreshold: 80, blockOnOverrun: true, audit: [] },
      { id: 'ORC-CMV-2', categoryId: 'BC-CMV-2', period: '2026', amount: 432000, alertThreshold: 80, blockOnOverrun: true, audit: [] },
      { id: 'ORC-CMV-3', categoryId: 'BC-CMV-3', period: '2026', amount: 432000, alertThreshold: 80, blockOnOverrun: true, audit: [] },
      { id: 'ORC-CMV-4', categoryId: 'BC-CMV-4', period: '2026', amount: 432000, alertThreshold: 80, blockOnOverrun: true, audit: [] },
      { id: 'ORC-CMV-5', categoryId: 'BC-CMV-5', period: '2026', amount: 432000, alertThreshold: 80, blockOnOverrun: true, audit: [] },
      { id: 'ORC-OPER-10', categoryId: 'BC-OPER', period: '2026', amount: 384000, alertThreshold: 80, blockOnOverrun: true, audit: [] },
      { id: 'ORC-PD-10', categoryId: 'BC-PD', period: '2026', amount: 1440000, alertThreshold: 80, blockOnOverrun: true, audit: [] },
      { id: 'ORC-GAR-10', categoryId: 'BC-GARANTIA', period: '2026', amount: 264000, alertThreshold: 80, blockOnOverrun: false, audit: [] },
      { id: 'ORC-PERDAS-10', categoryId: 'BC-PERDAS', period: '2026', amount: 144000, alertThreshold: 75, blockOnOverrun: true, audit: [] },
    ],
    budgetEntries: [
      { id: 'BL-1', kind: 'Previsão', categoryId: 'BC-CMV-1', period: '2026-10', amount: 22000, openAmount: 22000, status: 'Ativo', sourceModule: 'Compras', sourceType: 'Pedido de compra', sourceId: 'PC-7310', description: 'TPU antichoque 85A', costCenter: 'CC-320', createdAt: '2026-10-08T10:00:00.000Z', events: [] },
      { id: 'BL-9', kind: 'Previsão', categoryId: 'BC-CMV-2', period: '2026-10', amount: 9800, openAmount: 9800, status: 'Ativo', sourceModule: 'Compras', sourceType: 'Pedido de compra', sourceId: 'PC-7314', description: 'Usinagem de insertos', costCenter: 'CC-320', createdAt: '2026-10-08T11:00:00.000Z', events: [] },
      { id: 'BL-10', kind: 'Previsão', categoryId: 'BC-CMV-3', period: '2026-10', amount: 8400, openAmount: 8400, status: 'Ativo', sourceModule: 'Compras', sourceType: 'Pedido de compra', sourceId: 'PC-7315', description: 'Acessório para revenda', costCenter: 'CC-320', createdAt: '2026-10-08T11:20:00.000Z', events: [] },
      { id: 'BL-11', kind: 'Previsão', categoryId: 'BC-CMV-4', period: '2026-10', amount: 5000, openAmount: 5000, status: 'Ativo', sourceModule: 'Compras', sourceType: 'Pedido de compra', sourceId: 'PC-7316', description: 'Caixas de embarque', costCenter: 'CC-320', createdAt: '2026-10-08T11:40:00.000Z', events: [] },
      { id: 'BL-12', kind: 'Previsão', categoryId: 'BC-CMV-5', period: '2026-10', amount: 3000, openAmount: 3000, status: 'Ativo', sourceModule: 'Compras', sourceType: 'Pedido de compra', sourceId: 'PC-7317', description: 'Insumos de identificação', costCenter: 'CC-320', createdAt: '2026-10-08T12:00:00.000Z', events: [] },
      { id: 'BL-2', kind: 'Realizado pago', categoryId: 'BC-CMV-1', period: '2026-10', amount: 96740, openAmount: 0, status: 'Liquidado', sourceModule: 'Omie', sourceType: 'Pagamento', sourceId: 'PC-7299', externalId: 'PG-7299-1', invoiceNumber: '7299', linkModule: 'Compras', linkId: 'PC-7299', description: 'NF 7299 · matérias-primas', costCenter: 'CC-320', createdAt: '2026-10-09T14:00:00.000Z', events: [] },
      { id: 'BL-3', kind: 'Previsão', categoryId: 'BC-OPER', period: '2026-10', amount: 6800, openAmount: 6800, status: 'Ativo', sourceModule: 'Manutenção', sourceType: 'Ordem de serviço', sourceId: 'OS-1', description: 'Manutenção industrial', costCenter: 'CC-500', createdAt: '2026-10-10T10:00:00.000Z', events: [] },
      { id: 'BL-4', kind: 'Realizado pago', categoryId: 'BC-OPER', period: '2026-10', amount: 17450, openAmount: 0, status: 'Liquidado', sourceModule: 'Omie', sourceType: 'Pagamento', sourceId: 'OS-ANT-15', externalId: 'PG-MAN-15', invoiceNumber: '4415', linkModule: 'Manutenção', linkId: 'OS-ANT-15', description: 'NF 4415 · serviços de manutenção', costCenter: 'CC-500', createdAt: '2026-10-12T10:00:00.000Z', events: [] },
      { id: 'BL-5', kind: 'Previsão', categoryId: 'BC-PD', period: '2026-10', amount: 28500, openAmount: 28500, status: 'Ativo', sourceModule: 'Projetos', sourceType: 'Projeto', sourceId: 'PRJ-26-014', projectId: 'PRJ-26-014', description: 'Protótipos Case Mining S10', costCenter: 'CC-310', createdAt: '2026-10-01T10:00:00.000Z', events: [] },
      { id: 'BL-7', kind: 'Previsão', categoryId: 'BC-OPER', period: '2026-10', amount: 9500, openAmount: 9500, status: 'Ativo', sourceModule: 'Demandas', sourceType: 'Serviço', sourceId: 'DM-105', description: 'Revisão do cilindro da Injetora 03', costCenter: 'CC-500', createdAt: '2026-10-18T09:00:00.000Z', events: [] },
      { id: 'BL-13', kind: 'Previsão', categoryId: 'BC-PERDAS', period: '2026-10', amount: 150000, openAmount: 0, heldAmount: 150000, status: 'Retido', sourceModule: 'Demandas', sourceType: 'Material', sourceId: 'DM-106', description: 'Baixa de lote reprovado na inspeção', costCenter: 'CC-500', createdAt: '2026-10-19T09:00:00.000Z', events: [] },
      { id: 'BL-6', kind: 'Realizado pago', categoryId: 'BC-PD', period: '2026-10', amount: 41600, openAmount: 0, status: 'Liquidado', sourceModule: 'Omie', sourceType: 'Pagamento', sourceId: 'PRJ-26-014', externalId: 'PG-PD-14', invoiceNumber: '4418', linkModule: 'Projetos', linkId: 'PRJ-26-014', projectId: 'PRJ-26-014', description: 'NF 4418 · ferramental e ensaios', costCenter: 'CC-310', createdAt: '2026-10-11T10:00:00.000Z', events: [] },
      { id: 'BL-8', kind: 'Realizado pago', categoryId: 'BC-GARANTIA', period: '2026-10', amount: 890, openAmount: 0, status: 'Liquidado', sourceModule: 'Omie', sourceType: 'Pagamento', sourceId: 'NF-9012', externalId: 'PG-9012', invoiceNumber: '9012', description: 'NF 9012 · serviço avulso', costCenter: 'CC-500', createdAt: '2026-10-18T16:00:00.000Z', events: [] },
    ],
    budgetExceptions: [
      { id: 'BX-1', kind: 'Sem categoria', status: 'Pendente', sourceModule: 'Omie', sourceId: 'PG-SEM-CAT', description: 'NF 8891 sem categoria', amount: 3250, categoryIds: [], period: '2026-10', createdAt: '2026-10-16T10:00:00.000Z' },
      { id: 'BX-4', kind: 'Sem vínculo', status: 'Pendente', sourceModule: 'Omie', sourceId: 'PG-9012', description: 'NF 9012 entrou no custo de garantia e ainda não aponta para um documento', amount: 890, categoryIds: ['BC-GARANTIA'], period: '2026-10', createdAt: '2026-10-18T16:00:00.000Z' },
      { id: 'BX-3', kind: 'Saldo excedido', status: 'Pendente', sourceModule: 'Demandas', sourceId: 'DM-106', description: 'Baixa de lote reprovado na inspeção: excede o saldo anual de Perdas em R$ 6.000,00', amount: 150000, categoryIds: ['BC-PERDAS'], period: '2026-10', createdAt: '2026-10-19T09:00:00.000Z' },
      { id: 'BX-2', kind: 'Saldo excedido', status: 'Autorizada', sourceModule: 'Demandas', sourceId: 'DM-EXC-1', description: 'Compra emergencial autorizada acima do saldo', amount: 14800, categoryIds: ['BC-PERDAS'], period: '2026-10', createdAt: '2026-10-14T10:00:00.000Z', decidedAt: '2026-10-14T11:00:00.000Z', decidedBy: 'Marina Souza', decisionNote: 'Parada de cliente crítico' },
    ],
    budgetAlerts: [
      { id: 'BAL-1', categoryId: 'BC-CMV', period: '2026-10', kind: 'Alerta', threshold: 80, use: 80.52, message: 'Custo Mercadoria Vendida 2026-10 atingiu 80,52% (limiar 80%)', notifiedRoles: ['Financeiro'], status: 'Aberto', at: '2026-10-18T14:05:00.000Z' },
      { id: 'BAL-2', categoryId: 'BC-PERDAS', period: '2026-10', kind: 'Bloqueio', threshold: 100, use: 0, message: 'DM-106 retido: baixa de lote reprovado excede o saldo anual de Perdas em R$ 6.000,00', notifiedRoles: ['Qualidade', 'Financeiro', 'Gestor'], status: 'Aberto', at: '2026-10-19T09:00:00.000Z', sourceId: 'DM-106' },
    ],
    omieCategoryInbox: [
      { omieId: 'OMIE-04.01', code: '04.01', name: 'Frete sobre vendas', group: '04. Despesas Variáveis' },
    ],
    omiePayments: [
      { id: 'PG-SEM-CAT', invoiceNumber: '8891', sourceId: 'NF-8891', description: 'NF 8891 sem categoria', amount: 3250, paidAt: '2026-10-16T09:30:00.000Z', categoryIds: [], event: 'Pagamento' },
      { id: 'PG-9012', invoiceNumber: '9012', sourceId: 'NF-9012', description: 'NF 9012 · serviço avulso', amount: 890, paidAt: '2026-10-18T16:00:00.000Z', categoryIds: ['BC-GARANTIA'], event: 'Pagamento' },
      { id: 'PG-PARCIAL-7310', titleId: 'AP-7308', sourceId: 'PC-7310', amount: 11240, paidAt: '2026-10-18T14:00:00.000Z', categoryIds: ['BC-CMV'], event: 'Pagamento' },
      { id: 'PG-ESTORNO-7310', titleId: 'AP-7308', sourceId: 'PC-7310', amount: 1240, paidAt: '2026-10-19T09:00:00.000Z', categoryIds: ['BC-CMV'], event: 'Estorno' },
      { id: 'PG-MULTI-1', sourceId: 'NF-8892', amount: 2400, paidAt: '2026-10-19T10:00:00.000Z', categoryIds: ['BC-CMV', 'BC-OPER'], event: 'Pagamento' },
      { id: 'PG-ERRO-1', sourceId: 'PC-7000', amount: 1800, paidAt: '2026-10-18T15:00:00.000Z', categoryIds: ['BC-CMV'], event: 'Pagamento', error: 'Pagamento sem documento de origem conciliável' },
    ],
    financialTitles: [
      { id: 'AR-18420', kind: 'Receber', partnerId: 'c2', description: 'NF-e 18420 · Cases Extreme', reference: 'PV-2026-1033', origin: 'Venda', costCenter: 'CC-210', amount: 18600, dueDate: '2026-11-13', status: 'Aberto', createdAt: '2026-10-14T15:00:00.000Z' },
      { id: 'AR-18402', kind: 'Receber', partnerId: 'c4', description: 'NF-e 18402 · Mesa Lite', reference: 'PV-2026-1028', origin: 'Venda', costCenter: 'CC-210', amount: 7380, dueDate: '2026-10-12', status: 'Aberto', createdAt: '2026-09-12T15:00:00.000Z' },
      { id: 'AP-7308', kind: 'Pagar', partnerId: 'f1', description: 'Resina ABS · PC-7308', reference: 'PC-7308', origin: 'Compra', budgetId: 'ORC-CMV-10', budgetCategoryId: 'BC-CMV', budgetPeriod: '2026-10', costCenter: 'CC-320', amount: 22480, dueDate: '2026-10-20', status: 'Aberto', createdAt: '2026-10-08T11:00:00.000Z' },
      { id: 'AP-7299', kind: 'Pagar', partnerId: 'f3', description: 'Placas pogo pin · PC-7299', reference: 'PC-7299', origin: 'Compra', budgetId: 'ORC-CMV-10', budgetCategoryId: 'BC-CMV', budgetPeriod: '2026-10', costCenter: 'CC-320', amount: 8700, dueDate: '2026-10-10', status: 'Baixado', paidAt: '2026-10-09T14:00:00.000Z', createdAt: '2026-09-25T11:00:00.000Z' },
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
    tenants: [{ id: 'tenant-roboflex', legalName: 'Roboflex', tradeName: 'Roboflex', document: '00.000.000/0001-91', city: 'Minas Gerais', status: 'Ativa' }],
    economicGroups: [],
    omieConnections: [{ tenantId: 'tenant-roboflex', appKey: 'demo-roboflex', secretDefined: true, status: 'Simulada', accountLabel: 'Conta de demonstração' }],
    accessProfiles: seededProfiles(),
    userProfileAssignments: [],
    counters: { OP: 24030, RC: 5100, NC: 310, OS: 880, EV: 0, SY: 0, MV: 0, DT: 0, AL: 0, PC: 7310, NF: 18420, DM: 104, AP: 7308, AR: 18420, PV: 1056, OM: 98510, MF: 8, TP: 3 },
  }
}

const order = (id: string, omieId: string, customerId: string, itemId: string, quantity: number, promisedDate: string, priority: SalesOrder['priority'], value: number, receivedAt: string): SalesOrder =>
  ({ id, omieId, customerId, itemId, quantity, promisedDate, priority, value, receivedAt, planned: false })

/** Executa as próprias regras do motor para montar um cenário coerente em diferentes etapas. */
export function createSeedState(): ErpState {
  const s = baseState()
  s.userProfileAssignments = s.users.filter(user => !user.platformMaster).map((user, index) => ({
    id: `UP-${index + 1}`,
    userId: user.id,
    tenantId: 'tenant-roboflex',
    profileId: `profile-${profileCode(user.role)}`,
  }))
  prepareCatalog(s)
  const at = (dayOffset: number, hour: number, minute = 0) => setClock(new Date(2026, 9, 15 + dayOffset, hour, minute))
  const runOperations = (opId: string, operator: string) => {
    const op = s.productionOrders.find(entry => entry.id === opId)!
    for (const operation of op.operations) {
      if (operation.status === 'Concluída') continue
      startOperation(s, opId, operation.id, operator)
      reportProduction(s, opId, operation.id, operation.name === 'Retrabalho' ? 2 : op.quantity, 0, '', operator)
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
    reportProduction(s, injS9Frame.id, injS9Frame.operations[0].id, 40, 2, 'Rebarba excessiva', 'João Pereira')
    at(0, 8, 30); reportProduction(s, injS9Frame.id, injS9Frame.operations[0].id, 30, 1, 'Bolha / chupagem', 'João Pereira')
    at(0, 7, 15); startOperation(s, injS9Cover.id, injS9Cover.operations[0].id, 'Lucas Ferreira')
    reportProduction(s, injS9Cover.id, injS9Cover.operations[0].id, 20, 0, '', 'Lucas Ferreira')
    at(0, 8, 40); pauseOperation(s, injS9Cover.id, injS9Cover.operations[0].id, 'Ajuste de processo', 'Lucas Ferreira')

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
  return s
}

/** Catálogo, árvore, versões de estrutura com vigência e lotes iniciais. */
function prepareCatalog(s: ErpState) {
  for (const item of s.items) {
    item.catalog = defaultCatalog(item)
    item.catalog.classId = ensureClassPath(s, seedPath(item))
  }
  ensureClassPath(s, ['Componentes', 'Elétricos', 'Baterias'])
  ensureClassPath(s, ['Serviços', 'Engenharia'])

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

  for (const item of s.items.filter(entry => entry.bom?.length && ['PA', 'SE', 'KF', 'KT'].includes(entry.type))) {
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
    film.keyChanges.unshift({
      id: 'EXC-0001', field: 'ncm', from: film.ncm, to: '39095019', reason: 'Película passou a ser de TPU, não de vidro temperado. O NCM de vidro não se aplica mais',
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
  price('sv-campo', 'TP-PADRAO', 480, '2026-08-01', 'h')
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
    if (item.type === 'PA' || item.type === 'KF') item.catalog!.productionLeadDays = 3
    if (item.type === 'SE') item.catalog!.productionLeadDays = 1
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
}
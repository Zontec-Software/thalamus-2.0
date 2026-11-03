import { defineComponent, h } from 'vue'

const files = import.meta.glob('../assets/icons/**/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

function markup(name: string) {
  const entry = Object.entries(files).find(([path]) => path.endsWith(`/${name}.svg`))
  return entry?.[1] ?? ''
}

/** Ícone do design system. Aceita `size`, como os ícones que já estavam nas telas. */
export function dsIcon(name: string) {
  const svg = markup(name)
  return defineComponent({
    name: `Icon${name}`,
    props: { size: { type: [Number, String], default: 24 } },
    setup(props) {
      return () => h('span', {
        class: 'ds-icon',
        style: { width: `${props.size}px`, height: `${props.size}px` },
        innerHTML: svg,
        'aria-hidden': 'true',
      })
    },
  })
}

export const IconAdministracao = dsIcon('administracao')
export const IconComercial = dsIcon('comercial')
export const IconEngenharia = dsIcon('engenharia')
export const IconFinancas = dsIcon('financas')
export const IconGestao = dsIcon('gestao')
export const IconOperacoes = dsIcon('operacoes')
export const IconPatrimonio = dsIcon('patrimonio')
export const IconPessoas = dsIcon('pessoas')
export const IconServicos = dsIcon('servicos-e-contratos')
export const IconSuprimentos = dsIcon('suprimentos')
export const IconAjuda = dsIcon('ajuda')
export const IconAlerta = dsIcon('alerta')
export const IconBusca = dsIcon('busca')
export const IconFabrica = dsIcon('fabrica')
export const IconTarefas = dsIcon('minhas-tarefas')
export const IconNotificacoes = dsIcon('notificacoes')
export const IconPedido = dsIcon('pedido')
export const IconSeta = dsIcon('seta-direita')
export const IconTablet = dsIcon('tablet')

# Extensão do Chrome: oportunidade pelo WhatsApp

Protótipo para demonstrar o fluxo no mockup. Não faz parte do build do mockup (`npm run build` ignora esta pasta).

## O que faz

1. No WhatsApp Web (`web.whatsapp.com`), toda conversa aberta ganha o botão **Criar oportunidade** no cabeçalho.
2. Ao clicar, abre o Thalamus (ou reaproveita a aba que já está aberta) com o chat de nova oportunidade e uma **conversa de exemplo fixa**: Marcelo Dias, da Mineradora Horizonte, pedindo 30 cases IP68.
3. O assistente acha o cliente pelo telefone do exemplo e segue o fluxo.

Por enquanto a extensão **não lê** a conversa real do WhatsApp. O exemplo está em `content-whatsapp.js` (constante `EXAMPLE`); basta editar o texto para mudar a demonstração.

## Instalar

1. Abra `chrome://extensions` e ligue o **Modo do desenvolvedor** (canto superior direito).
2. Clique em **Carregar sem compactação** e escolha esta pasta (`extensao-whatsapp`).
3. Em **Detalhes > Opções da extensão**, escolha onde abrir o Thalamus: GitHub Pages (padrão) ou `localhost:8080`.
4. Abra `https://web.whatsapp.com`, entre em qualquer conversa e clique em **Criar oportunidade**. Se o WhatsApp já estava aberto, recarregue a aba.

Depois de editar algum arquivo da extensão, clique em **Recarregar** no cartão dela em `chrome://extensions` e recarregue o WhatsApp Web.

O telefone do exemplo (`(31) 98800-1200`) é o do Marcelo Dias no cadastro de demonstração. Se o cadastro for apagado ou o telefone mudar, o assistente não acha o cliente e pergunta qual é.

## Protocolo com a página

Extensão para a página:

```json
{
  "source": "thalamus-extension",
  "type": "whatsapp-context",
  "version": 1,
  "id": "identificador-unico",
  "contact": { "name": "Marcelo Dias", "phone": "5531988001200" },
  "messages": [{ "from": "client", "text": "Bom dia!", "at": "09:12" }]
}
```

Página para a extensão, quando está pronta: `{ "source": "thalamus-mockup", "type": "ready" }`. A validação está em `src/domain/whatsappContext.ts` (aceita só a própria janela, até 100 mensagens de 1000 caracteres).

## O que é simulação e o que precisa virar produto

- A conversa é fixa. Ler a conversa real exige acessar a página do WhatsApp Web (`#main`, `data-pre-plain-text`, `data-id`), que não tem API pública, muda sem aviso e pode ferir os termos do WhatsApp. A alternativa estável é a API oficial do WhatsApp Business.
- A resposta do assistente é montada com regras simples: cliente pelo telefone, última fala do cliente como pedido, data escrita como `dd/mm/aaaa`. Não há IA de verdade, e a oportunidade não é criada.
- Falta uma tela para o vendedor escolher quais mensagens enviar (LGPD) e a autenticação da extensão no Thalamus.

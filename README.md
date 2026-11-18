# PDV Lanchonete

Sistema de ponto de venda operacional para lanchonete (cupom não fiscal), rodando 100% no navegador.

## Como rodar

```bash
npm install
npm run dev
```

Abra o endereço mostrado no terminal (geralmente `http://localhost:5173`).

## PINs de demonstração

- Admin: `1234`
- Caixa: `1111`
- Cozinha: `0000`

Os PINs ficam só neste arquivo. Na tela de login eles não aparecem. Depois de 5 erros o acesso espera alguns segundos. O caixa bloqueia sozinho após alguns minutos sem uso (a cozinha não bloqueia, para a fila continuar visível). Desconto acima de 20% ou R$ 30, cancelamento de venda paga e restauração de backup pedem o PIN do administrador.

## Fluxo rápido

1. Entre com o PIN do caixa ou admin
2. Abra o caixa em **Caixa** com o fundo de troco
3. Venda no **PDV** (F2 busca, F4 pagar, F8 cozinha)
4. Use **Mesas** para comandas e **Cozinha** para a fila
5. Feche o caixa no fim do dia e exporte backup em **Ajustes**

## Dados

Tudo fica no IndexedDB deste computador. Use **Ajustes → Exportar JSON** para backup.

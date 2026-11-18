import type { CashSession, Order, StoreSettings } from '../types'
import { PAYMENT_LABELS, ORDER_TYPE_LABELS } from '../types'
import { money } from './money'
import { formatDateTime } from './format'
import { escapeHtml } from './security'

function itemLines(order: Order): string {
  return order.items
    .map((item) => {
      const extras = item.extras
        .map((e) => `  + ${escapeHtml(e.name)} ${money(e.price)}`)
        .join('<br/>')
      const options = item.options
        .map((o) => `  * ${escapeHtml(o.groupName)}: ${escapeHtml(o.choiceName)}`)
        .join('<br/>')
      const notes = item.notes ? `  Obs: ${escapeHtml(item.notes)}` : ''
      return `
        <div style="margin-bottom:6px">
          <div><strong>${item.qty}x</strong> ${escapeHtml(item.name)}</div>
          <div style="display:flex;justify-content:space-between">
            <span>${money(item.unitPrice)}</span>
            <span>${money(item.lineTotal)}</span>
          </div>
          ${extras ? `<div>${extras}</div>` : ''}
          ${options ? `<div>${options}</div>` : ''}
          ${notes ? `<div>${notes}</div>` : ''}
        </div>`
    })
    .join('')
}

export function buildReceiptHtml(order: Order, settings: StoreSettings): string {
  const payments = order.payments
    .map((p) => {
      const label = PAYMENT_LABELS[p.method] || 'Outro'
      return `<div style="display:flex;justify-content:space-between"><span>${escapeHtml(label)}</span><span>${money(p.amount)}</span></div>`
    })
    .join('')

  return `
    <div style="font-family:monospace">
      <div style="text-align:center;margin-bottom:8px">
        <strong style="font-size:14px">${escapeHtml(settings.storeName)}</strong><br/>
        ${escapeHtml(settings.address)}<br/>
        ${escapeHtml(settings.phone)}<br/>
        <strong>CUPOM NÃO FISCAL</strong>
      </div>
      <div>Pedido: #${escapeHtml(order.dailyNumber)}</div>
      <div>Tipo: ${escapeHtml(ORDER_TYPE_LABELS[order.type] || order.type)}</div>
      ${order.tableName ? `<div>Mesa: ${escapeHtml(order.tableName)}</div>` : ''}
      ${order.customerName ? `<div>Cliente: ${escapeHtml(order.customerName)}</div>` : ''}
      ${order.deliveryAddress ? `<div>Endereço: ${escapeHtml(order.deliveryAddress)}</div>` : ''}
      <div>Data: ${escapeHtml(formatDateTime(order.paidAt || order.createdAt))}</div>
      <hr/>
      ${itemLines(order)}
      <hr/>
      <div style="display:flex;justify-content:space-between"><span>Subtotal</span><span>${money(order.subtotal)}</span></div>
      ${order.discountAmount > 0 ? `<div style="display:flex;justify-content:space-between"><span>Desconto</span><span>-${money(order.discountAmount)}</span></div>` : ''}
      ${order.serviceFee > 0 ? `<div style="display:flex;justify-content:space-between"><span>Taxa serviço</span><span>${money(order.serviceFee)}</span></div>` : ''}
      ${order.deliveryFee > 0 ? `<div style="display:flex;justify-content:space-between"><span>Entrega</span><span>${money(order.deliveryFee)}</span></div>` : ''}
      <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px"><span>TOTAL</span><span>${money(order.total)}</span></div>
      <hr/>
      ${payments}
      ${order.changeAmount > 0 ? `<div style="display:flex;justify-content:space-between"><span>Troco</span><span>${money(order.changeAmount)}</span></div>` : ''}
      <hr/>
      <div style="text-align:center;margin-top:8px">${escapeHtml(settings.receiptFooter)}</div>
    </div>
  `
}

export function buildKitchenHtml(order: Order, settings: StoreSettings): string {
  return `
    <div style="font-family:monospace">
      <div style="text-align:center;margin-bottom:8px">
        <strong>${escapeHtml(settings.storeName)}</strong><br/>
        <strong style="font-size:16px">COMANDA #${escapeHtml(order.dailyNumber)}</strong>
      </div>
      <div>Tipo: ${escapeHtml(ORDER_TYPE_LABELS[order.type] || order.type)}</div>
      ${order.tableName ? `<div>Mesa: ${escapeHtml(order.tableName)}</div>` : ''}
      ${order.customerName ? `<div>Cliente: ${escapeHtml(order.customerName)}</div>` : ''}
      <div>Hora: ${escapeHtml(formatDateTime(order.kitchenSentAt || order.createdAt))}</div>
      <hr/>
      ${order.items
        .map((item) => {
          const extras = item.extras.map((e) => `+ ${escapeHtml(e.name)}`).join(', ')
          const options = item.options.map((o) => `${escapeHtml(o.choiceName)}`).join(', ')
          return `
            <div style="margin-bottom:8px">
              <strong style="font-size:14px">${item.qty}x ${escapeHtml(item.name)}</strong>
              ${extras ? `<div>${extras}</div>` : ''}
              ${options ? `<div>${options}</div>` : ''}
              ${item.notes ? `<div>Obs: ${escapeHtml(item.notes)}</div>` : ''}
            </div>`
        })
        .join('')}
      ${order.notes ? `<hr/><div>Obs pedido: ${escapeHtml(order.notes)}</div>` : ''}
    </div>
  `
}

export function buildCashCloseHtml(
  session: CashSession,
  settings: StoreSettings,
  summary: {
    salesTotal: number
    cashSales: number
    supplies: number
    withdraws: number
    expected: number
    counted: number
    difference: number
  },
): string {
  return `
    <div style="font-family:monospace">
      <div style="text-align:center">
        <strong>${escapeHtml(settings.storeName)}</strong><br/>
        <strong>FECHAMENTO DE CAIXA</strong>
      </div>
      <div>Aberto: ${escapeHtml(formatDateTime(session.openedAt))}</div>
      <div>Fechado: ${session.closedAt ? escapeHtml(formatDateTime(session.closedAt)) : '-'}</div>
      <div>Operador: ${escapeHtml(session.closedBy || session.openedBy)}</div>
      <hr/>
      <div style="display:flex;justify-content:space-between"><span>Fundo inicial</span><span>${money(session.openingAmount)}</span></div>
      <div style="display:flex;justify-content:space-between"><span>Vendas totais</span><span>${money(summary.salesTotal)}</span></div>
      <div style="display:flex;justify-content:space-between"><span>Vendas dinheiro</span><span>${money(summary.cashSales)}</span></div>
      <div style="display:flex;justify-content:space-between"><span>Suprimentos</span><span>${money(summary.supplies)}</span></div>
      <div style="display:flex;justify-content:space-between"><span>Sangrias</span><span>${money(summary.withdraws)}</span></div>
      <div style="display:flex;justify-content:space-between"><span>Esperado</span><span>${money(summary.expected)}</span></div>
      <div style="display:flex;justify-content:space-between"><span>Contado</span><span>${money(summary.counted)}</span></div>
      <div style="display:flex;justify-content:space-between"><strong>Diferença</strong><strong>${money(summary.difference)}</strong></div>
    </div>
  `
}

export function printHtml(html: string) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('sandbox', 'allow-modals allow-same-origin')
  iframe.setAttribute('title', 'Impressão')
  iframe.style.position = 'fixed'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.style.left = '0'
  iframe.style.top = '0'
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument
  if (!doc) {
    iframe.remove()
    return
  }
  doc.open()
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>Cupom</title><style>body{font-family:ui-monospace,monospace;width:80mm;margin:0;padding:4mm;color:#000}</style></head><body>${html}</body></html>`,
  )
  doc.close()
  iframe.contentWindow?.focus()
  iframe.contentWindow?.print()
  window.setTimeout(() => iframe.remove(), 1500)
}

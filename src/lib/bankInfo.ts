import type { BankInfoSnapshot } from './types'

export const bankInfo: BankInfoSnapshot = {
  alias: 'vakstoree',
  cbu: '0000076500000053416757',
  holder: 'Alvarez Valentin',
  cuit: '20-47144775-8'
}

export const whatsappNumber: string = process.env.PUBLIC_WHATSAPP_NUMBER || '+5491100000000'

export const transferDefaultMessage: string =
  'Hola, te paso el comprobante de mi pedido por transferencia.'

export const transferExpiryHours: number = Number(process.env.TRANSFER_EXPIRY_HOURS) || 72

export const TRANSFER_DISCOUNT = 0.15


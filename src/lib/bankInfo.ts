import type { BankInfoSnapshot } from './types'

export const bankInfo: BankInfoSnapshot = {
  alias: 'ALIAS.PLACEHOLDER',
  cbu: '0000000000000000000000',
  holder: 'Nombre Apellido',
  cuit: '00-00000000-0'
}

export const whatsappNumber: string = process.env.PUBLIC_WHATSAPP_NUMBER || '+5491100000000'

export const transferDefaultMessage: string =
  'Hola, te paso el comprobante de mi pedido por transferencia.'

export const transferExpiryHours: number = Number(process.env.TRANSFER_EXPIRY_HOURS) || 72

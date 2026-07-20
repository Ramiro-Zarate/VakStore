# Vak Store — E-commerce en producción

Tienda online de indumentaria deportiva **en producción con ventas reales**, desarrollada end-to-end: catálogo, carrito, checkout con pagos online, autenticación, envíos y emails transaccionales.

**Sitio live:** https://vak-store.vercel.app

*Production e-commerce for sportswear with real sales, built end-to-end: catalog, cart, online-payment checkout, authentication, shipping and transactional emails.*

---

## Features

- **Catálogo** con filtros dinámicos (categoría, talle, liga), búsqueda por texto y paginación server-side
- **Carrito** persistente en localStorage con control de stock en tiempo real
- **Checkout con Mercado Pago** (Checkout Pro): webhooks con firma HMAC, procesamiento idempotente, **reembolso automático** si falta stock al confirmar el pago
- **Pago por transferencia** con 15% de descuento, auto-cancelación de órdenes impagas a las 72hs (Vercel Cron)
- **Autenticación** con Supabase Auth (email/password + Google OAuth), base de datos PostgreSQL con políticas RLS
- **Envíos**: cotización por zona según código postal, **etiqueta imprimible 10×15**, tracking con deep-link al carrier (Andreani / Correo Argentino)
- **Emails transaccionales** con Resend (confirmación, instrucciones de transferencia, cancelación) + notificación al admin
- Compra como invitado con seguimiento de pedido por id + email (verificación timing-safe)
- SEO y performance: 95+ en Google Lighthouse, imágenes lazy, CSP y headers de seguridad

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Astro 6 (SSR) + React 19 (islands) |
| Lenguaje | TypeScript (strict) |
| Auth + DB | Supabase (`@supabase/ssr`, PostgreSQL, RLS) |
| Pagos | Mercado Pago SDK (Checkout Pro + webhooks) |
| Email | Resend |
| Validación | Zod |
| Estilos | CSS Modules + design tokens |
| Deploy | Vercel (Cron jobs incluidos) |

## Desarrollo local

```bash
npm install
cp .env.example .env   # completar credenciales de Supabase / MP / Resend
npm run dev
```

Scripts útiles:

```bash
npm run build            # build de producción
npm run seed             # sembrar DB desde scripts/data/stock.xlsx
npm run confirm-order <orderId>   # confirmar orden paga por transferencia
```

La documentación operativa completa (arquitectura, flujos de checkout/webhook, migraciones, runbooks) está en [`AGENTS.md`](./AGENTS.md).

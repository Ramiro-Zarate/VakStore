// @ts-check
import { defineConfig } from 'astro/config'
import process from 'node:process'

import react from '@astrojs/react'
import sitemap from '@astrojs/sitemap'

import vercel from '@astrojs/vercel'

import sentry from '@sentry/astro'

const sentryDsn = process.env.SENTRY_DSN

// https://astro.build/config
export default defineConfig({
  site: 'https://vakstoree.com',
  integrations: [
    react(),
    sitemap({
      filter: (page) =>
        !page.includes('/api/') &&
        !page.includes('/pedido') &&
        !page.includes('/cuenta') &&
        !page.includes('/login') &&
        !page.includes('/registro') &&
        !page.includes('/checkout') &&
        !page.includes('/auth/') &&
        !page.includes('/404')
    }),
    ...(sentryDsn ? [sentry({ dsn: sentryDsn, sourceMapsUploadOptions: { project: 'vak-store', authToken: process.env.SENTRY_AUTH_TOKEN } })] : [])
  ],
  adapter: vercel()
})

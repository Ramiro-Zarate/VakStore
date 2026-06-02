// @ts-check
import { defineConfig } from 'astro/config'
import process from 'node:process'

import react from '@astrojs/react'

import vercel from '@astrojs/vercel'

import sentry from '@sentry/astro'

const sentryDsn = process.env.SENTRY_DSN

// https://astro.build/config
export default defineConfig({
  integrations: [
    react(),
    ...(sentryDsn ? [sentry({ dsn: sentryDsn, sourceMapsUploadOptions: { project: 'vak-store', authToken: process.env.SENTRY_AUTH_TOKEN } })] : [])
  ],
  adapter: vercel()
})

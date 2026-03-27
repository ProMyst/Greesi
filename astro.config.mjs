// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import pagefind from 'astro-pagefind';
import vercel from '@astrojs/vercel';

export default defineConfig({
  site: 'https://greesi.com',
  output: 'hybrid',
  adapter: vercel(),
  build: {
    format: 'directory',
  },
  vite: {
    plugins: [tailwindcss()]
  },
  integrations: [sitemap(), pagefind()]
});

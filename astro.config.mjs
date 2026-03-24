// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import pagefind from 'astro-pagefind';

export default defineConfig({
  site: 'https://folvr.com',
  build: {
    format: 'directory',
  },
  vite: {
    plugins: [tailwindcss()]
  },
  integrations: [sitemap(), pagefind()]
});

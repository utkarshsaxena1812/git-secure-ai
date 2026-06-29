import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `--mode single` bundles everything into one self-contained index.html
// (used only to generate an inline preview). The default build is standard.
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  // Honor an injected PORT (e.g. from the preview harness) when present.
  server: process.env.PORT ? { port: Number(process.env.PORT), strictPort: true } : undefined,
}))

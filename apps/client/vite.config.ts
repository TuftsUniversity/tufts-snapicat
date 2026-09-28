import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

console.log('### LOADING SNAPICAT VITE CONFIG ###')

export default defineConfig({
	plugins: [react(), tailwindcss()],

	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
		},
	},

	server: {
		port: 5174,

		proxy: {
			'/api': {
				target: 'http://127.0.0.1:8080',
				changeOrigin: true,

				configure: (proxy) => {
					console.log('### FASTAPI PROXY CONFIGURED ###')

					proxy.on('proxyReq', (_proxyReq, req) => {
						console.log(
							`### PROXY REQUEST: ${req.method} ${req.url}`,
						)
					})

					proxy.on('proxyRes', (proxyRes, req) => {
						console.log(
							`### PROXY RESPONSE: ${proxyRes.statusCode} ${req.url}`,
						)
					})

					proxy.on('error', (error, req) => {
						console.error(
							`### PROXY ERROR: ${req.method} ${req.url}`,
							error,
						)
					})
				},
			},
		},
	},
})
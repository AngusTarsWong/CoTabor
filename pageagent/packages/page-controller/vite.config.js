// @ts-check
import chalk from 'chalk'
import { dirname, resolve } from 'path'
import dts from 'unplugin-dts/vite'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'

const __dirname = dirname(fileURLToPath(import.meta.url))

console.log(chalk.cyan(`📦 Building @page-agent/page-controller`))

export default defineConfig({
	clearScreen: false,
	plugins: [
		dts({ tsconfigPath: './tsconfig.dts.json', bundleTypes: true }),
		cssInjectedByJsPlugin({ relativeCSSInjection: true }),
	],
	publicDir: false,
	esbuild: {
		keepNames: true,
	},
	build: {
		lib: {
			entry: resolve(__dirname, 'src/PageController.ts'),
			name: 'PageController',
			fileName: 'page-controller',
			formats: ['iife'], // 改为 iife 格式方便全局注入
		},
		outDir: resolve(__dirname, 'dist', 'lib'),
		rollupOptions: {
			// 取消 external，把所有依赖打进一个包里
			external: [],
			onwarn: function (message, handler) {
				if (message.code === 'EVAL') return
				handler(message)
			},
		},
		minify: true, // 开启压缩
		sourcemap: false,
		cssCodeSplit: false,
	},
	define: {
		'process.env.NODE_ENV': '"production"',
	},
})

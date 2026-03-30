import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config';

export default mergeConfig(
	viteConfig,
	defineConfig({
		test: {
			exclude: [...configDefaults.exclude, 'tests/e2e/**'],
			coverage: {
				provider: 'v8',
				enabled: true,
				reporter: ['text', 'html', 'json'],
				lines: true,
				statements: true,
				functions: true
			}
		}
	})
);

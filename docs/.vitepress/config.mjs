import { defineConfig } from 'vitepress';

export default defineConfig({
	title: 'Routing Simulator Docs',
	description: 'Auto-generated component docs',
	themeConfig: {
		nav: [
			{ text: 'Home', link: '/' },
			{ text: 'Components', link: '/api/' },
			{ text: 'TypeScript API', link: '/api-ts/' }
		],
		sidebar: {
			'/api/': [
				{
					text: 'Components',
					items: [{ text: 'Index', link: '/api/' }]
				}
			],
			'/api-ts/': [
				{
					text: 'TypeScript API',
					items: [{ text: 'Index', link: '/api-ts/' }]
				}
			]
		}
	}
});

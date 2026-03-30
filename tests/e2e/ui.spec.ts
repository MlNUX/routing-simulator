import { test, expect, type Page } from '@playwright/test';

const getCurrentStepInfo = async (page: Page) => {
	const stateText = await page.locator('text=Current state:').first().textContent();

	if (stateText) {
		const dv = stateText.match(/Current state: (\d+)\.(\d+) · (\w+)/);
		if (dv) {
			const iteration = Number.parseInt(dv[1]);
			const phase = Number.parseInt(dv[2]);
			return iteration * 100 + phase;
		}

		const ls = stateText.match(/Current state: #(\d+)/);
		if (ls) {
			return Number.parseInt(ls[1]);
		}

		const init = stateText.match(/Current state: (\d+) · (\w+)/);
		if (init) {
			return Number.parseInt(init[1]);
		}
	}

	return 0;
};

test.describe('Routing Simulator - ui tests', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveTitle('Routing Simulator');
	});

	test('place a new router TF11', async ({ page }) => {
		const initialRouterCount = await page.locator('text=/^[A-Z]\\d*$/').count();
		expect(initialRouterCount).toBe(3);

		await page.getByRole('button', { name: 'Toggle tools menu' }).click();
		await page.locator('.flex > div:nth-child(4)').click();
		await page.getByRole('group').filter({ hasText: 'R1' }).getByRole('img').click();
		await page.getByRole('group').filter({ hasText: 'R2' }).getByRole('img').click();
		await page.getByTestId('svelte-flow__wrapper').getByRole('img', { name: 'Router' }).click();

		const routerCount = await page.locator('text=/^[A-Z]\\d*$/').count();
		expect(routerCount).toBe(0);

		await page.locator('.flex.cursor-pointer.items-center.gap-2').first().click();
		await page.locator('.svelte-flow__pane').click();

		const finalRouterCount = await page.locator('text=/^[A-Z]\\d*$/').count();
		expect(finalRouterCount).toBe(1);
	});

	test('create Link between two routers TF12', async ({ page }) => {
		await page.getByRole('button', { name: 'Toggle tools menu' }).click();

		const linkTool = page.locator('.flex.cursor-pointer.items-center.gap-2').nth(1);
		await linkTool.click();

		await page.getByText('R1').click();
		await page.getByText('R3').click();

		expect(page.locator('div').filter({ hasText: /^1$/ }).nth(4)).toBeVisible();
	});

	test('delete router TF13', async ({ page }) => {
		await expect(page.getByText('R1')).toBeVisible();
		await expect(page.getByText('R2')).toBeVisible();
		await expect(page.getByText('R3')).toBeVisible();

		const initialRouters = await page.locator('text=/^R\\d+$/').count();
		await page.getByRole('button', { name: 'Toggle tools menu' }).click();
		await page.getByText('Delete', { exact: true }).click();
		await page.getByRole('group').filter({ hasText: 'R3' }).getByRole('img').click();

		const remainingRouters = await page.locator('text=/^R\\d+$/').count();
		expect(remainingRouters).toBe(initialRouters - 1);
	});

	test('start algorithm TF20', async ({ page }) => {
		const distanceVectorButton = page.getByRole('button', { name: 'DISTANCE VECTOR', exact: true });
		await expect(distanceVectorButton).toBeVisible();
		await distanceVectorButton.click();

		const confirmResetButton = page.getByRole('button', { name: 'Yes, reset to initial' });
		await expect(confirmResetButton).toBeVisible();
		await confirmResetButton.click();

		await expect(page.getByText('Current state: 0 · Initialize')).toBeVisible();

		const playButton = page.getByRole('button', { name: 'Play' });
		await expect(playButton).toBeVisible();
		await playButton.click();

		const pauseButton = page.getByRole('button', { name: 'Pause' });
		await expect(pauseButton).toBeVisible();

		await expect(page.getByText('R1')).toBeVisible();
	});

	test('pause and resume algorithm TF22', async ({ page }) => {
		await page.getByRole('button', { name: 'DISTANCE VECTOR', exact: true }).click();
		await page.getByRole('button', { name: 'Yes, reset to initial' }).click();

		const playButton = page.getByRole('button', { name: 'Play' });
		await playButton.click();

		const pauseButton = page.getByRole('button', { name: 'Pause' });
		await expect(pauseButton).toBeVisible();
		await pauseButton.click();

		await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
	});

	test('navigate steps via timeline TF23', async ({ page }) => {
		await page.getByRole('button', { name: 'DISTANCE VECTOR', exact: true }).click();
		await page.getByRole('button', { name: 'Yes, reset to initial' }).click();
		//Play / Pause
		await page.getByRole('button', { name: 'Play' }).click();
		expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
		await page.getByRole('button', { name: 'Pause' }).click();
		expect(page.getByRole('button', { name: 'Play' })).toBeVisible();

		const stepBefore = await getCurrentStepInfo(page);

		// step forward
		await page.getByRole('button', { name: 'Step forward' }).click();

		const stepAfter = await getCurrentStepInfo(page);

		expect(stepAfter).toBeGreaterThan(stepBefore);
		// step backward
		await page.getByRole('button', { name: 'Step backward' }).click();
		await page.getByRole('button', { name: 'Step backward' }).click();

		const stepAfterBackward = await getCurrentStepInfo(page);

		expect(stepAfterBackward).toBeLessThan(stepAfter);
	});

	test('modify topology TF24', async ({ page }) => {
		await page.getByRole('button', { name: 'DISTANCE VECTOR', exact: true }).click();
		await page.getByRole('button', { name: 'Yes, reset to initial' }).click();

		await page.getByRole('button', { name: 'Step forward' }).click();
		await page.getByRole('button', { name: 'Step forward' }).click();
		await page.getByRole('button', { name: 'Step forward' }).click();

		const step = await getCurrentStepInfo(page);
		expect(step).toBeGreaterThan(0);

		await page.getByRole('button', { name: 'Step backward' }).click();

		await page.getByText('R2').click();

		await expect(page.getByText('Router details')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Disable router' })).toBeVisible();
	});

	test('show routing table and router state TF30', async ({ page }) => {
		await page.getByText('R2').click();

		await expect(page.getByText('Router details')).toBeVisible();
		await expect(page.getByText('Status')).toBeVisible();
		await expect(page.getByText('Router is active.')).toBeVisible();

		await expect(page.getByText('Connections')).toBeVisible();
		await expect(page.getByText('Direct links from this router')).toBeVisible();
	});

	test('show router state via timeline TF31', async ({ page }) => {
		await page.getByRole('button', { name: 'DISTANCE VECTOR', exact: true }).click();
		await page.getByRole('button', { name: 'Yes, reset to initial' }).click();

		await page.getByRole('button', { name: 'Play' }).click();
		await page.getByRole('button', { name: 'Pause' }).click();

		await page.getByText('R2').click();

		await page.getByRole('button', { name: 'Step backward' }).click();

		await expect(page.getByText('Router details')).toBeVisible();
		await expect(page.getByText('Status')).toBeVisible();
	});

	test('display preset scenarios TF40', async ({ page }) => {
		const initialRouterCount = await page.locator('text=/^[A-Z]\\d*$/').count();
		expect(initialRouterCount).toBe(3);

		const presetButton = page.getByRole('button', { name: 'CHOOSE PRESET' });
		await expect(presetButton).toBeVisible();
		await presetButton.click();
		await expect(page.getByText('Scenarios')).toBeVisible();

		await expect(page.getByRole('button', { name: 'Distance Vector Five Router' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Link State Seven Router' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Distance Vector Weight Change' })).toBeVisible();
		await expect(
			page.getByRole('button', { name: 'Link State Path Divergence' })
		).toBeVisible();

		await page.getByRole('button', { name: 'Distance Vector Five Router' }).click();
		await page.getByRole('button', { name: 'Yes, load preset' }).click();

		const finalRouterCount = await page.locator('text=/^[A-Z]\\d*$/').count();
		expect(finalRouterCount).toBeGreaterThan(3);
	});

	test('load preset topology TF41', async ({ page }) => {
		const presetButton = page.getByRole('button', { name: 'CHOOSE PRESET' });
		await expect(presetButton).toBeVisible();
		await presetButton.click();

		const preset = page.getByRole('button', { name: 'Link State Seven Router' });
		await expect(preset).toBeVisible();
		await preset.click();

		await expect(page.getByText('Load preset?')).toBeVisible();

		const confirmButton = page.getByRole('button', { name: 'Yes, load preset' });
		await expect(confirmButton).toBeVisible();
		await confirmButton.click();

		const finalRouterCount = await page.locator('text=/^[A-Z]\\d*$/').count();
		expect(finalRouterCount).toBeGreaterThan(3);

		const step = await getCurrentStepInfo(page);
		expect(step).toBe(0);
	});

	test('export topology TF50, TNFA 6', async ({ page }) => {
		const saveButton = page.getByRole('button', { name: 'Save' });
		await expect(saveButton).toBeVisible();

		const downloadPromise = page.waitForEvent('download');
		await saveButton.click();
		const download = await downloadPromise;

		expect(download.suggestedFilename()).toMatch(/.*\.json$/);

		await expect(page.getByRole('button', { name: 'CHOOSE PRESET' })).toBeVisible();
	});

	test('import topology TF51', async ({ page }) => {
		const importButton = page.getByRole('button', { name: 'Import' });
		await expect(importButton).toBeVisible();
		await importButton.click();

		await expect(page.getByText('Load JSON?')).toBeVisible();
		await expect(
			page.getByText('Loading will overwrite the current simulation. Continue?')
		).toBeVisible();

		await page.getByRole('button', { name: 'Cancel' }).click();
	});

	test('load invalid JSON file TF52', async ({ page }) => {
		const importButton = page.getByRole('button', { name: 'Import' });
		await expect(importButton).toBeVisible();
		await importButton.click();

		await expect(page.getByText('Load JSON?')).toBeVisible();

		const fileInput = page.locator('input[type="file"]').first();

		const invalidJson = Buffer.from('{ invalid json without quotes }');
		await fileInput.setInputFiles([
			{
				name: 'invalid.json',
				mimeType: 'application/json',
				buffer: invalidJson
			}
		]);

		await page.getByRole('button', { name: 'Yes, load JSON' }).click();

		await page.waitForTimeout(1000);

		await expect(page.locator('text=/^[A-Z]\\d*$/')).toHaveCount(3);

		await expect(page.getByText('R1')).toBeVisible();
	});

	test('roundtrip test TF53', async ({ page }) => {
		const initialRouterCount = await page.locator('text=/^[A-Z]\\d*$/').count();
		expect(initialRouterCount).toBe(3);

		const saveButton = page.getByRole('button', { name: 'Save' });
		await expect(saveButton).toBeVisible();

		const downloadPromise = page.waitForEvent('download');
		await saveButton.click();
		const download = await downloadPromise;

		expect(download.suggestedFilename()).toMatch(/.*\.json$/);
		const exportedPath = await download.path();
		expect(exportedPath).toBeTruthy();

		await page.getByRole('button', { name: 'CHOOSE PRESET' }).click();
		await page.getByRole('button', { name: 'Link State Seven Router' }).click();
		await page.getByRole('button', { name: 'Yes, load preset' }).click();

		const presetRouterCount = await page.locator('text=/^[A-Z]\\d*$/').count();
		expect(presetRouterCount).toBeGreaterThan(3);

		const importButton = page.getByRole('button', { name: 'Import' });
		await expect(importButton).toBeVisible();
		await importButton.click();

		await expect(page.getByText('Load JSON?')).toBeVisible();

		const fileInput = page.locator('input[type="file"]').first();
		await fileInput.setInputFiles(exportedPath);

		await page.getByRole('button', { name: 'Yes, load JSON' }).click();

		await expect(page.locator('text=/^[A-Z]\\d*$/')).toHaveCount(initialRouterCount);

		await expect(page.getByText('R1')).toBeVisible();
	});

	test('warning when overwriting existing topology TF54', async ({ page }) => {
		await page.getByText('R2').click();

		const presetButton = page.getByRole('button', { name: 'CHOOSE PRESET' });
		await presetButton.click();

		const preset = page.getByRole('button', { name: 'Link State Seven Router' });
		await preset.click();

		await expect(page.getByText('Load preset?')).toBeVisible();
		await expect(page.getByText(/reloads the current simulation/)).toBeVisible();

		await page.getByRole('button', { name: 'Cancel' }).click();
	});

	test('changes in past', async ({ page }) => {
		await page.getByRole('button', { name: 'DISTANCE VECTOR', exact: true }).click();
		await page.getByRole('button', { name: 'Yes, reset to initial' }).click();

		await page.getByRole('button', { name: 'Step forward' }).click();
		await page.getByRole('button', { name: 'Step forward' }).click();
		await page.getByRole('button', { name: 'Step forward' }).click();

		expect(await getCurrentStepInfo(page)).toBeGreaterThan(0);

		const routerNode = page.getByTestId('svelte-flow__wrapper').getByText('R2');

		await routerNode.click();

		const disableButton = page.getByRole('button', { name: 'Disable router' });
		await expect(disableButton).toBeVisible();
		await disableButton.click();

		expect(await page.getByRole('button', { name: 'Enable router' }).isVisible()).toBe(true);

		await page.getByRole('button', { name: 'Step backward' }).click();
		await page.getByRole('button', { name: 'Step backward' }).click();

		await routerNode.click();
		expect(await page.getByRole('button', { name: 'Disable router' }).isVisible()).toBe(true);
	});
});

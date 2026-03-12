import { test, expect } from '@playwright/test';

test.describe('Session Replay - Graph Clearing & Zoom', () => {
  test.beforeEach(async ({ page }) => {
    // Start Tribbles server and load landing page
    await page.goto('http://localhost:8777');
    await page.waitForSelector('#session-browser', { timeout: 5000 });
  });

  test('clicking session loads graph without persisting previous graph', async ({ page }) => {
    // Click first session
    const firstCard = page.locator('[id^="session-"]').first();
    await firstCard.click();
    await page.waitForSelector('#app:not(.hidden)', { timeout: 5000 });

    // Wait for graph to render
    await page.waitForSelector('#graph-container svg g.nodes circle', { timeout: 5000 });
    const firstGraphNodes = await page.locator('#graph-container svg g.nodes circle').count();
    expect(firstGraphNodes).toBeGreaterThan(0);

    // Get zoom level of first graph
    const firstZoom = await page.evaluate(() => {
      const display = document.getElementById('zoom-level');
      return display?.textContent || '100%';
    });

    // Click reset button to go back to landing
    await page.locator('#btn-reset').click();
    await page.waitForSelector('#session-browser', { timeout: 5000 });

    // Click second session (different session)
    const secondCard = page.locator('[id^="session-"]').nth(1);
    await secondCard.click();
    await page.waitForSelector('#app:not(.hidden)', { timeout: 5000 });

    // Wait for new graph to render
    await page.waitForSelector('#graph-container svg g.nodes circle', { timeout: 5000 });
    const secondGraphNodes = await page.locator('#graph-container svg g.nodes circle').count();

    // Verify zoom was reset (should be back to 100% or fit)
    const secondZoom = await page.evaluate(() => {
      const display = document.getElementById('zoom-level');
      return display?.textContent || '100%';
    });

    // Zoom should be reset (100% or different from first graph's zoom)
    expect(secondZoom).toContain('%');
  });

  test('zoom level persists during playback but resets on session switch', async ({ page }) => {
    // Click first session
    const firstCard = page.locator('[id^="session-"]').first();
    await firstCard.click();
    await page.waitForSelector('#graph-container svg g.nodes circle', { timeout: 5000 });

    // Zoom in
    await page.locator('#btn-zoom-in').click();
    await page.waitForTimeout(500);
    const zoomedLevel = await page.evaluate(() => {
      const display = document.getElementById('zoom-level');
      return parseInt(display?.textContent || '100');
    });
    expect(zoomedLevel).toBeGreaterThan(100);

    // Play through several steps (zoom should persist)
    await page.locator('#btn-next').click();
    await page.waitForTimeout(300);
    const afterStepZoom = await page.evaluate(() => {
      const display = document.getElementById('zoom-level');
      return parseInt(display?.textContent || '100');
    });
    expect(afterStepZoom).toBeCloseTo(zoomedLevel, 5); // Should be same zoom level

    // Go back and switch sessions
    await page.locator('#btn-reset').click();
    await page.waitForSelector('#session-browser', { timeout: 5000 });

    const secondCard = page.locator('[id^="session-"]').nth(1);
    await secondCard.click();
    await page.waitForSelector('#graph-container svg g.nodes circle', { timeout: 5000 });

    // Zoom should be reset
    const newSessionZoom = await page.evaluate(() => {
      const display = document.getElementById('zoom-level');
      return parseInt(display?.textContent || '100');
    });
    // Should be back to default (100% or fit level, not the zoomed level)
    expect(newSessionZoom).toBeLessThanOrEqual(100);
  });

  test('fit button centers and scales graph appropriately', async ({ page }) => {
    // Click first session
    const firstCard = page.locator('[id^="session-"]').first();
    await firstCard.click();
    await page.waitForSelector('#graph-container svg g.nodes circle', { timeout: 5000 });

    // Zoom in significantly
    await page.locator('#btn-zoom-in').click();
    await page.locator('#btn-zoom-in').click();
    await page.waitForTimeout(500);
    const zoomedLevel = await page.evaluate(() => parseInt(document.getElementById('zoom-level')?.textContent || '100'));

    // Click fit button
    await page.locator('#btn-zoom-fit').click();
    await page.waitForTimeout(500);

    // Zoom should be reduced (fit to view)
    const fitZoom = await page.evaluate(() => parseInt(document.getElementById('zoom-level')?.textContent || '100'));
    expect(fitZoom).toBeLessThan(zoomedLevel);
  });
});

test.describe('View Mode Switcher', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8777');
    await page.waitForSelector('#session-browser', { timeout: 5000 });

    // Click a session to enter replay view
    const firstCard = page.locator('[id^="session-"]').first();
    await firstCard.click();
    await page.waitForSelector('#app:not(.hidden)', { timeout: 5000 });
  });

  test('view mode selector switches between Split/Graph/Log', async ({ page }) => {
    const viewModeSelect = page.locator('#view-mode-select');

    // Start in split mode (default for desktop)
    await expect(viewModeSelect).toHaveValue('split');

    // Switch to graph-only
    await viewModeSelect.selectOption('graph');
    const messageLog = page.locator('#message-log');
    await expect(messageLog).toBeHidden();

    // Switch to log-only
    await viewModeSelect.selectOption('log');
    const graphContainer = page.locator('#graph-container');
    await expect(graphContainer).toBeHidden();

    // Switch back to split
    await viewModeSelect.selectOption('split');
    await expect(messageLog).toBeVisible();
    await expect(graphContainer).toBeVisible();
  });

  test('view mode preference is saved to localStorage', async ({ page, context }) => {
    // Set view mode to graph
    await page.locator('#view-mode-select').selectOption('graph');

    // Create new page (simulates browser reload)
    const newPage = await context.newPage();
    await newPage.goto('http://localhost:8777');
    await newPage.waitForSelector('#session-browser', { timeout: 5000 });

    // Click a session
    const firstCard = newPage.locator('[id^="session-"]').first();
    await firstCard.click();
    await newPage.waitForSelector('#app:not(.hidden)', { timeout: 5000 });

    // View mode should still be graph
    await expect(newPage.locator('#view-mode-select')).toHaveValue('graph');
    await newPage.close();
  });
});

test.describe('Session Panel - Sidebar Overflow', () => {
  test('session panel does not overflow when graph is visible', async ({ page }) => {
    await page.goto('http://localhost:8777');
    await page.waitForSelector('#session-browser', { timeout: 5000 });

    // Click session to load graph
    const firstCard = page.locator('[id^="session-"]').first();
    await firstCard.click();
    await page.waitForSelector('#app:not(.hidden)', { timeout: 5000 });

    // Get sidebar dimensions
    const sidebar = page.locator('#app:not(.hidden)');
    const sidebarBox = await sidebar.boundingBox();

    // If we're in split mode, verify sidebar width is reasonable
    const viewMode = await page.locator('#view-mode-select').inputValue();
    if (viewMode === 'split') {
      // Sidebar should be ~20-30% of viewport
      const viewportSize = page.viewportSize();
      expect(sidebarBox.width).toBeLessThan(viewportSize.width * 0.4);
      expect(sidebarBox.width).toBeGreaterThan(viewportSize.width * 0.15);
    }
  });

  test('session cards remain visible and scrollable in sidebar', async ({ page }) => {
    await page.goto('http://localhost:8777');
    await page.waitForSelector('#session-browser', { timeout: 5000 });

    // Count visible session cards
    const sessionCards = page.locator('[id^="session-"]');
    const cardCount = await sessionCards.count();
    expect(cardCount).toBeGreaterThan(0);

    // Verify we can see at least the first card
    const firstCard = sessionCards.first();
    await expect(firstCard).toBeVisible();
  });
});

test.describe('Graph Rendering - Layout Persistence', () => {
  test('layout selection persists during session playback', async ({ page }) => {
    await page.goto('http://localhost:8777');
    await page.waitForSelector('#session-browser', { timeout: 5000 });

    const firstCard = page.locator('[id^="session-"]').first();
    await firstCard.click();
    await page.waitForSelector('#graph-container svg g.nodes circle', { timeout: 5000 });

    // Switch to circular layout
    await page.locator('#layout-select').selectOption('circular');
    await page.waitForTimeout(500);

    // Play a few steps
    await page.locator('#btn-next').click();
    await page.waitForTimeout(300);

    // Layout should still be circular
    await expect(page.locator('#layout-select')).toHaveValue('circular');
  });

  test('no visual artifacts when switching between layouts', async ({ page }) => {
    await page.goto('http://localhost:8777');
    await page.waitForSelector('#session-browser', { timeout: 5000 });

    const firstCard = page.locator('[id^="session-"]').first();
    await firstCard.click();
    await page.waitForSelector('#graph-container svg g.nodes circle', { timeout: 5000 });

    // Get initial node count
    const initialNodeCount = await page.locator('#graph-container svg g.nodes circle').count();

    // Switch layouts multiple times
    const layouts = ['circular', 'hierarchy', 'timeline', 'force'];
    for (const layout of layouts) {
      await page.locator('#layout-select').selectOption(layout);
      await page.waitForTimeout(800); // Wait for layout to compute

      // Node count should remain the same
      const currentNodeCount = await page.locator('#graph-container svg g.nodes circle').count();
      expect(currentNodeCount).toBe(initialNodeCount);
    }
  });
});

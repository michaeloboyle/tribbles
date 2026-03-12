# Tribbles BDD Tests

Behavioral-Driven Development tests for Tribbles session browser using Playwright.

## Test Coverage

### replay.spec.js
- **Graph Clearing & Zoom**
  - Session switching clears old graph (no persistence artifacts)
  - Zoom level resets when switching sessions
  - Zoom persists during single-session playback
  - Fit button centers and scales appropriately

- **View Mode Switcher**
  - Split/Graph/Log modes switch correctly
  - View mode preference saved to localStorage
  - No layout issues when switching modes

- **Session Panel Overflow**
  - Sidebar doesn't overflow when graph visible
  - Session cards remain visible and scrollable
  - Proper layout on mobile, tablet, desktop

- **Layout Persistence**
  - Layout selection persists during playback
  - No visual artifacts when switching layouts
  - Node count consistent across layout changes

## Running Tests

### Install dependencies
```bash
npm install
```

### Run all tests
```bash
npm test
```

### Run with UI (recommended for debugging)
```bash
npm run test:ui
```

### Run in debug mode
```bash
npm run test:debug
```

### Run specific test
```bash
npx playwright test tests/replay.spec.js
```

### Run on specific browser
```bash
npx playwright test --project=chromium
npx playwright test --project=mobile-safari
```

## Test Structure

Each test follows the pattern:
1. **Setup**: Navigate to Tribbles, wait for elements
2. **Action**: Click sessions, zoom, switch modes
3. **Assert**: Verify behavior (zoom level, visibility, persistence)

Tests automatically start/stop Tribbles server (configure in `playwright.config.js`).

## Debugging Failed Tests

1. **Generate HTML report**:
   ```bash
   npx playwright show-report
   ```

2. **View screenshots/videos**:
   - Failed tests capture screenshots in `test-results/`
   - Videos available for debugging

3. **Interactive debug**:
   ```bash
   npx playwright test --debug
   ```
   - Use DevTools to step through tests
   - Inspect elements, check console

## Known Issues Tracked

- [ ] Graph artifacts persist when switching sessions (Issue: zoom state not cleared)
- [ ] Session panel overflow in graph-only view on tablet
- [ ] Zoom level display sometimes lags in sidebar

## Adding New Tests

Add new test cases to `replay.spec.js`:

```javascript
test('descriptive test name', async ({ page }) => {
  // Setup
  await page.goto('http://localhost:8777');
  await page.waitForSelector('#session-browser');

  // Action
  await page.locator('[id^="session-"]').first().click();

  // Assert
  await expect(page.locator('#graph-container')).toBeVisible();
});
```

## CI/CD Integration

In GitHub Actions, run tests on every push:

```yaml
- name: Run Playwright tests
  run: npm test

- name: Upload results
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
```

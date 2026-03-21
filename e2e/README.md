# NYRA Desktop E2E Tests

Comprehensive end-to-end test suite for the NYRA Desktop Electron application using Playwright.

## Overview

This directory contains automated E2E tests that verify the functionality of the NYRA Desktop app across:

- **App Launch**: Window creation, API exposure, boot splash
- **Onboarding**: Welcome flow, provider setup, step navigation
- **Chat Interface**: Input, message display, sending, suggestions
- **Settings**: Panel opening, tabs, channel configuration
- **Navigation**: Sidebar, panel groups, overlay management
- **Panels**: Model Router, Voice Engine, Plugin Sandbox, Agent Network, I18n
- **Theme/Visual**: Dark theme, contrast, accessibility
- **Advanced**: Multiline input, state preservation, performance

## Test Files

```
e2e/
├── playwright.config.ts          # Playwright configuration
├── README.md                      # This file
└── tests/
    ├── helpers/
    │   └── electron-app.ts        # App launch/close helpers
    ├── 01-app-launch.e2e.ts       # App window and API tests
    ├── 02-onboarding.e2e.ts       # Onboarding flow tests
    ├── 03-chat-interface.e2e.ts   # Chat input and sending
    ├── 04-settings.e2e.ts         # Settings panel tests
    ├── 05-channel-config.e2e.ts   # Channel configuration
    ├── 06-navigation.e2e.ts       # Sidebar and panel navigation
    ├── 07-panels.e2e.ts           # Panel interactions (Model Router, Voice, etc.)
    ├── 08-theme-visual.e2e.ts     # Theme and visual regression
    └── 09-advanced-interactions.e2e.ts # Advanced chat and perf
```

## Requirements

- Node.js 18+
- Electron 29+ (from package.json)
- @playwright/test 1.42.0+ (from package.json)
- Built app output at `out/main/index.js`

## Setup

1. **Build the app first:**
   ```bash
   npm run build
   ```

2. **Install Playwright browsers (if not already done):**
   ```bash
   npx playwright install
   ```

## Running Tests

### Run all E2E tests
```bash
npm run test:e2e
```

### Run in headed mode (see browser)
```bash
npm run test:e2e:headed
```

### Run specific test file
```bash
npx playwright test e2e/tests/01-app-launch.e2e.ts
```

### Run tests matching a pattern
```bash
npx playwright test --grep "Navigation"
```

### Run with debug mode
```bash
PWDEBUG=1 npm run test:e2e
```

### Run with detailed output
```bash
npx playwright test --verbose
```

## Test Structure

Each test file follows this pattern:

```typescript
import { test, expect } from '@playwright/test'
import { launchApp, closeApp, skipOnboarding } from './helpers/electron-app'
import type { ElectronApplication, Page } from '@playwright/test'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  const launched = await launchApp()
  app = launched.app
  page = launched.page
  // Optionally skip onboarding
  await skipOnboarding(page)
})

test.afterAll(async () => {
  await closeApp(app)
})

test.describe('Feature Group', () => {
  test('should do something', async () => {
    // Test implementation
  })
})
```

## Helper Functions

The `helpers/electron-app.ts` file provides:

- **launchApp()**: Launches Electron app and waits for initialization
  ```typescript
  const { app, page } = await launchApp()
  ```

- **closeApp(app)**: Gracefully closes the app
  ```typescript
  await closeApp(app)
  ```

- **skipOnboarding(page)**: Clicks through onboarding screens
  ```typescript
  await skipOnboarding(page)
  ```

- **waitForElement(page, selector, timeout)**: Waits for element with timeout
  ```typescript
  await waitForElement(page, '[data-testid="chat-input"]')
  ```

- **getWindowCount(app)**: Returns number of open windows
  ```typescript
  const count = await getWindowCount(app)
  ```

- **getFirstWindow(app)**: Gets first open window
  ```typescript
  const page = await getFirstWindow(app)
  ```

## Selectors Strategy

Tests use flexible selectors to handle UI variations:

```typescript
// Primary selector with fallbacks
const element = await page.$('[data-testid="primary"], .fallback-class, button:has-text("Label")')
```

This approach allows tests to work even if specific classes/ids change.

## Best Practices

### 1. Use data-testid attributes (when available)
```typescript
// Best - explicit test identifiers
const input = await page.$('[data-testid="chat-input"]')

// Good - fallback to CSS classes
const input = await page.$('.chat-input')

// Acceptable - text matching for buttons
const btn = await page.$('button:has-text("Send")')
```

### 2. Add data-testid to app components (improvement needed)
```tsx
// In React components
<input data-testid="chat-input" placeholder="Type a message..." />
<button data-testid="send-button" aria-label="Send">
  <SendIcon />
</button>
<div data-testid="sidebar">...</div>
```

### 3. Handle optionality gracefully
```typescript
test('optional feature', async () => {
  const element = await page.$('[data-testid="optional-feature"]')
  
  if (!element) {
    test.skip()
    return
  }
  
  // Test the feature
})
```

### 4. Use proper timeouts
```typescript
// App launch (slower)
await page.waitForSelector(selector, { timeout: 45_000 })

// Regular UI interactions (faster)
await page.waitForSelector(selector, { timeout: 10_000 })
```

### 5. Wait for state changes
```typescript
// Type and wait for onChange handlers
await input.fill('text')
await page.waitForTimeout(300) // Let handlers run

// Click and wait for panel to appear
await button.click()
await page.waitForTimeout(500)
```

## Configuration

### playwright.config.ts

Key settings:

- **timeout**: 90 seconds per test (extended for Electron startup)
- **expect.timeout**: 15 seconds for assertions
- **retries**: 1 on failure (2 in CI)
- **workers**: 1 (Electron must run serially)
- **trace**: Record on first retry
- **screenshot**: Only on failure
- **video**: Retain on failure (headed mode)

## Debugging

### View test traces
```bash
npx playwright show-trace trace.zip
```

### Run with headed browser
```bash
npm run test:e2e:headed
```

### Enable detailed output
```bash
DEBUG=pw:api npm run test:e2e
```

### Pause on failure
Use `test.only()` or `--debug` flag to pause at failures

## CI/CD Integration

### GitHub Actions example
```yaml
- name: Run E2E tests
  run: npm run test:e2e
  env:
    CI: true

- name: Upload report
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
```

### Environment variables
- `CI`: Set in CI environments (affects retries)
- `DEBUG`: Enable debug logging (`DEBUG=nyra:*`)
- `PWDEBUG`: Enable Playwright Inspector (`PWDEBUG=1`)

## Improvements Needed

### 1. Add data-testid attributes
The app would benefit from explicit test identifiers in components:
```tsx
<div data-testid="app-root">
  <div data-testid="sidebar">
    <div data-testid="session-list">
      {/* sessions */}
    </div>
  </div>
  <div data-testid="chat-area">
    <textarea data-testid="chat-input" />
    <button data-testid="send-button" />
  </div>
</div>
```

### 2. Improve test coverage
- E2E tests for complex workflows (multi-turn conversations)
- Plugin/extension loading tests
- File upload/handling tests
- Keyboard shortcut coverage
- Error recovery scenarios

### 3. Add performance benchmarks
- First interactive paint timing
- Chat message rendering performance
- Panel open/close timing
- Memory usage tracking

### 4. Enhance accessibility testing
- ARIA attribute validation
- Keyboard navigation flow
- Screen reader compatibility
- Color contrast verification

## Troubleshooting

### App doesn't launch
```
Error: Electron app binary not found at out/main/index.js
```
**Solution**: Run `npm run build` first

### Timeout waiting for app
```
Timeout 45000ms exceeded waiting for selector
```
**Solutions**:
- Check if app built successfully
- Verify no errors in console (run with `PWDEBUG=1`)
- Increase timeout if needed
- Check for onboarding modal blocking interaction

### Tests fail in CI but pass locally
- May be timing/environment-related
- Check node version matches locally
- Verify Playwright cache is fresh
- Run with `--verbose` flag

### Panel tests not finding elements
- Use browser dev tools to inspect selectors
- Try more flexible selectors with `:has-text()`
- Check if panels are being rendered at all
- May need `test.skip()` for optional features

## Contributing

When adding new tests:

1. Follow the existing test structure and naming
2. Use flexible selectors for maintainability
3. Add comments explaining complex test logic
4. Use `test.skip()` for optional UI features
5. Ensure tests are idempotent (can run multiple times)
6. Add appropriate waits for async operations
7. Update this README with new test categories

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [Electron Testing Guide](https://www.electronjs.org/docs/latest/docs/tutorial/automated-testing)
- [Best Practices for E2E Testing](https://playwright.dev/docs/best-practices)
- [Debugging Tests](https://playwright.dev/docs/debug)


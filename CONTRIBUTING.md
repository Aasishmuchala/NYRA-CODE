# Contributing to NYRA Desktop

Thank you for your interest in contributing to NYRA Desktop! This document provides guidelines and instructions for contributing to our open-source project.

## Code of Conduct

By participating in this project, you agree to maintain a welcoming and respectful environment for all contributors.

## Setting Up Your Development Environment

### Prerequisites

- Node.js 18+ and npm 9+
- Git
- A code editor (VS Code recommended)
- Electron development knowledge (helpful but not required)

### Installation

1. Fork the repository and clone it locally:
   ```bash
   git clone https://github.com/your-username/nyra-desktop.git
   cd nyra-desktop
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

This launches the Electron app in development mode with hot-reload enabled for React components.

### Build Commands

- `npm run dev` - Start development server
- `npm run build` - Build for production (electron-vite)
- `npm run package:mac` - Package macOS application (.dmg)
- `npm run package:win` - Package Windows application (.exe)
- `npm test` - Run unit tests (vitest)
- `npm run test:e2e` - Run end-to-end tests (playwright)

## Branch Naming Conventions

Use clear, descriptive branch names with the following prefixes:

- `feature/` - New features (e.g., `feature/openai-integration`)
- `fix/` - Bug fixes (e.g., `fix/memory-leak-in-chat`)
- `docs/` - Documentation updates (e.g., `docs/api-reference`)
- `refactor/` - Code refactoring without feature changes (e.g., `refactor/component-structure`)
- `test/` - Test additions or fixes (e.g., `test/playwright-suite`)
- `perf/` - Performance improvements (e.g., `perf/reduce-bundle-size`)

Example: `git checkout -b feature/custom-agent-templates`

## Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/) for clear, semantic commit history.

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat` - A new feature
- `fix` - A bug fix
- `docs` - Documentation changes
- `style` - Code style changes (formatting, missing semicolons, etc.)
- `refactor` - Code refactoring
- `perf` - Performance improvements
- `test` - Adding or updating tests
- `chore` - Build scripts, dependencies, tooling

### Examples

```
feat(memory): add 4-tier semantic architecture for memory management

Implement hierarchical memory system with immediate, contextual,
persistent, and episodic tiers. Improve context retrieval speed by 40%.

Closes #123
```

```
fix(chat): prevent message duplication in channel sync

Cache recent messages to prevent duplicate processing when syncing
with OpenClaw gateway.

Fixes #456
```

## Pull Request Process

1. **Create a Branch**: Use the naming conventions above
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Your Changes**: Commit regularly with semantic messages

3. **Keep Up with Main**:
   ```bash
   git fetch origin
   git rebase origin/main
   ```

4. **Push Your Branch**:
   ```bash
   git push origin feature/your-feature-name
   ```

5. **Open a Pull Request** on GitHub with:
   - Descriptive title matching the feature/fix
   - Reference to related issues (e.g., "Fixes #123")
   - Clear description of changes
   - Screenshots for UI changes

6. **Code Review**: Address feedback from reviewers

7. **Merge**: Once approved, your PR will be merged to main

## Code Style

### TypeScript

- Use **strict mode** (`"strict": true` in tsconfig.json)
- Prefer explicit types over `any`
- Use meaningful variable and function names
- Keep functions focused and under 50 lines when possible

Example:
```typescript
interface MessageProps {
  content: string;
  timestamp: Date;
  sender: User;
}

const ChatMessage: React.FC<MessageProps> = ({ content, timestamp, sender }) => {
  return (
    <div className="message">
      <span className="sender-name">{sender.name}</span>
      <p className="message-content">{content}</p>
      <time>{timestamp.toLocaleTimeString()}</time>
    </div>
  );
};
```

### React & Components

- Functional components with hooks
- Props should be typed with interfaces
- Use descriptive component names (PascalCase)
- Colocate related components

### Styling

- Use **Tailwind CSS** for styling
- **No inline styles** (use Tailwind classes)
- Responsive design with Tailwind breakpoints
- Custom styles in separate `.css` files only when necessary

Example:
```tsx
// Good
<button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
  Click me
</button>

// Bad - avoid inline styles
<button style={{ padding: '8px 16px', backgroundColor: '#2563eb' }}>
  Click me
</button>
```

### File Organization

```
src/
├── components/      # Reusable React components
├── pages/          # Page-level components
├── hooks/          # Custom React hooks
├── types/          # TypeScript type definitions
├── utils/          # Utility functions
├── styles/         # Global styles
├── api/            # API/OpenClaw integration
└── main/           # Electron main process
```

## Testing

### Unit Tests (vitest)

Write tests for utilities, hooks, and business logic:

```bash
npm test
```

File naming: `*.test.ts` or `*.test.tsx`

Example:
```typescript
import { describe, it, expect } from 'vitest';
import { formatMessage } from '../utils/formatting';

describe('formatMessage', () => {
  it('should trim whitespace', () => {
    expect(formatMessage('  hello  ')).toBe('hello');
  });

  it('should preserve line breaks', () => {
    expect(formatMessage('hello\nworld')).toBe('hello\nworld');
  });
});
```

### End-to-End Tests (playwright)

Test user workflows and integrations:

```bash
npm run test:e2e
```

File location: `e2e/` directory

Example:
```typescript
import { test, expect } from '@playwright/test';

test('user can create and send message', async ({ page }) => {
  await page.goto('http://localhost:3000');

  const input = page.locator('input[placeholder="Type a message..."]');
  await input.fill('Hello, world!');

  await page.click('button[aria-label="Send message"]');

  await expect(page.locator('text=Hello, world!')).toBeVisible();
});
```

### Test Coverage

- Aim for >80% coverage for critical paths
- Test edge cases and error handling
- Mock external API calls

## Issue Reporting

### Before Reporting

- Check existing issues to avoid duplicates
- Try reproducing on the latest `main` branch
- Gather system information (OS, Node version, NYRA version)

### Using Templates

Use GitHub issue templates for:
- [Bug Reports](.github/ISSUE_TEMPLATE/bug_report.md)
- [Feature Requests](.github/ISSUE_TEMPLATE/feature_request.md)

Provide as much context as possible, including:
- Steps to reproduce
- Expected behavior vs. actual behavior
- Screenshots or error logs
- Environment details

## Documentation

- Update README.md for significant features
- Add JSDoc comments to exported functions
- Keep CHANGELOG.md updated with your changes
- Document breaking changes clearly

## Getting Help

- Check the [README](README.md) for setup help
- Search [existing issues](https://github.com/nyra-ai/nyra-desktop/issues)
- Ask in [GitHub Discussions](https://github.com/nyra-ai/nyra-desktop/discussions)
- Review code examples in the docs/ folder

## License

By contributing to NYRA Desktop, you agree that your contributions will be licensed under the Apache 2.0 License.

---

Thank you for contributing to NYRA Desktop! Your efforts help make AI assistance more accessible and powerful for everyone.

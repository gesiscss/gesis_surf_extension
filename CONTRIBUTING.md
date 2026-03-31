# Contributing to GESIS Surf Extension

Thank you for your interest in contributing to GESIS Surf Extension! This document outlines our development workflow, branching strategy, and commit conventions.

## 📋 Table of Contents

- [Development Workflow](#development-workflow)
- [Branching Strategy](#branching-strategy)
- [Commit Conventions](#commit-conventions)
- [Pull Request Process](#pull-request-process)
- [Code Quality](#code-quality)
- [Getting Started](#getting-started)

---

## 🔄 Development Workflow

We follow a **Git Flow** inspired workflow with continuous integration:

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PRODUCTION                                   │
│                           prod                                       │
│                            ▲                                         │
│                            │ (admin merge only)                      │
│                            │                                         │
│ ───────────────────────────┼─────────────────────────────────────── │
│                         STAGING                                      │
│                           main                                       │
│                            ▲                                         │
│                            │ (merge/release)                         │
│                            │                                         │
│ ───────────────────────────┼─────────────────────────────────────── │
│                        DEVELOPMENT                                   │
│                           dev                                        │
│                         ▲  ▲  ▲                                      │
│                        /   │   \                                     │
│                       /    │    \                                    │
│ ─────────────────────/─────┼─────\─────────────────────────────────  │
│               FEATURE BRANCHES                                       │
│                                                                      │
│   feature/    bugfix/     hotfix/     refactor/                      │
│   add-auth    fix-login   critical    cleanup-models                 │
└─────────────────────────────────────────────────────────────────────┘
```

### Branch Hierarchy

| Branch       | Purpose                   | Deployed To        | Merge Access |
| ------------ | ------------------------- | ------------------ | ------------ |
| `prod`       | Production-ready code     | Production server  | Admin only   |
| `main`       | Staging/Testing           | Staging server     | Maintainers  |
| `dev`        | Development integration   | Development server | Contributors |
| `feature/*`  | New features              | Local/PR preview   | -            |
| `bugfix/*`   | Non-critical bug fixes    | Local/PR preview   | -            |
| `hotfix/*`   | Critical production fixes | Direct to prod     | Admin only   |
| `refactor/*` | Code improvements         | Local/PR preview   | -            |

---

## 🌿 Branching Strategy

### Creating a Feature Branch

```bash
# Start from dev branch
git checkout dev
git pull origin dev

# Create your feature branch
git checkout -b feature/your-feature-name
```

### Branch Naming Convention

Use the following prefixes:

| Prefix      | Use Case                | Example                      |
| ----------- | ----------------------- | ---------------------------- |
| `feature/`  | New functionality       | `feature/add-privacy-controls` |
| `bugfix/`   | Bug fixes               | `bugfix/fix-auth-token`      |
| `hotfix/`   | Urgent production fixes | `hotfix/security-patch`      |
| `refactor/` | Code refactoring        | `refactor/optimize-events`   |
| `docs/`     | Documentation updates   | `docs/update-api-guide`      |
| `test/`     | Test additions          | `test/add-click-tests`       |

### Workflow Steps

1. **Create branch** from `dev`
2. **Develop** your feature with atomic commits
3. **Push** your branch to remote
4. **Create PR** targeting `dev`
5. **Code Review** by team members
6. **Merge** after approval
7. **Delete** feature branch after merge

### Promotion Flow

```
feature/* ──▶ dev ──▶ main (staging) ──▶ prod (production)
              │           │                    │
              │           │                    └── Admin merge only
              │           └── Maintainer merge
              └── Contributor merge after review
```

---

## 📝 Commit Conventions

We use **[Commitizen](https://commitizen-tools.github.io/commitizen/)** with **Conventional Commits** specification.

### Commit Message Format

```
<type>(<scope>): <subject>

[optional body]

[optional footer(s)]
```

### Commit Types

| Type       | Description             | Example                                         |
| ---------- | ----------------------- | ----------------------------------------------- |
| `feat`     | New feature             | `feat(auth): add token refresh mechanism`       |
| `fix`      | Bug fix                 | `fix(background): resolve memory leak`          |
| `docs`     | Documentation           | `docs(readme): update installation steps`       |
| `style`    | Code style (formatting) | `style(components): apply prettier formatting`  |
| `refactor` | Code refactoring        | `refactor(events): simplify event handling`     |
| `perf`     | Performance improvement | `perf(content): optimize dom tracking`          |
| `test`     | Adding/updating tests   | `test(auth): add authentication tests`          |
| `build`    | Build system changes    | `build(vite): update webpack config`            |
| `ci`       | CI/CD changes           | `ci(github): add test workflow`                 |
| `chore`    | Maintenance tasks       | `chore(deps): update dependencies`              |

### Using Commitizen

```bash
# Install commitizen (included in dev dependencies)
pnpm install

# Make your changes, then stage them
git add .

# Use commitizen to create a commit
npm run cz commit
# or
pnpm cz commit
```

Commitizen will guide you through creating a properly formatted commit:

```
? Select the type of change you are committing: feat
? What is the scope of this change? (press enter to skip) auth
? Write a short description: add JWT token refresh mechanism
? Provide additional contextual information: (press enter to skip)
? Is this a BREAKING CHANGE? No
```

### Pre-commit Hooks

We use **Husky** to ensure code quality before commits:

```bash
# Install pre-commit hooks
pnpm run prepare

# Run manually on staged files
npm run lint
npm run type-check
npm run prettier
```

---

## 🔀 Pull Request Process

### Before Creating a PR

1. ✅ Ensure all tests pass: `pnpm run test`
2. ✅ Run linters: `pnpm run lint`
3. ✅ Format code: `pnpm run prettier`
4. ✅ Check types: `pnpm run type-check`
5. ✅ Update documentation if needed

### PR Title Convention

Follow the same format as commits:

```
feat(scope): description
fix(scope): description
```

### PR Template

When creating a PR, include:

- **Description**: What does this PR do?
- **Related Issue**: Link to issue if applicable
- **Type of Change**: Feature / Bug fix / Refactor / etc.
- **Testing**: How was this tested?
- **Checklist**:
  - [ ] Tests added/updated
  - [ ] Documentation updated
  - [ ] No breaking changes (or documented)
  - [ ] Code follows style guidelines
  - [ ] Type checking passes

### Merge Strategy

- **Feature → Dev**: Squash and merge
- **Dev → Main**: Merge commit (preserves history)
- **Main → Prod**: Merge commit (admin only)
- **Hotfix → Prod**: Merge commit (admin only)

---

## 🔍 Code Quality

We use **Husky**, **lint-staged**, **ESLint**, **Prettier**, and **TypeScript** to ensure consistent code quality before every commit.

### Pre-commit Hooks

Our `.husky/` hooks run the following checks before commits:

| Hook                 | Purpose                                      |
| -------------------- | -------------------------------------------- |
| **ESLint**           | JavaScript/TypeScript linting                |
| **Prettier**         | Code formatting (JS, CSS, Markdown, JSON)    |
| **TypeScript**       | Type checking                                |
| **lint-staged**      | Run linters only on staged files             |

### Installing Pre-commit Hooks

```bash
# Install dependencies
pnpm install

# Install the git hooks
pnpm run prepare
```

### ESLint Configuration

Our ESLint configuration includes:

- `eslint-config-airbnb-typescript` - Airbnb style with TypeScript support
- `eslint-plugin-react` - React-specific rules
- `eslint-plugin-jsx-a11y` - Accessibility checks
- `eslint-plugin-import` - Import statement checks
- `eslint-plugin-prettier` - Prettier integration

### Required Tools Summary

All tools are configured in `package.json` and workspace configuration:

| Tool         | Purpose         | Command                |
| ------------ | --------------- | ---------------------- |
| **ESLint**   | Linting         | `pnpm run lint`        |
| **Prettier** | Code formatting | `pnpm run prettier`    |
| **TypeScript** | Type checking | `pnpm run type-check`  |
| **Turbo**    | Task running    | `pnpm run build`       |

### Running All Checks Manually

```bash
# Run all quality checks
pnpm run lint
pnpm run type-check
pnpm run prettier

# Or for the entire monorepo
turbo lint type-check prettier
```

---

## 🚀 Getting Started

### 1. Fork and Clone

```bash
git clone https://github.com/YOUR_USERNAME/Gesis-Surf.git
cd Gesis-Surf
```

### 2. Set Up Development Environment

```bash
# Install dependencies with pnpm
pnpm install

# Install pre-commit hooks
pnpm run prepare
```

### 3. Create Your Branch

```bash
git checkout dev
git pull origin dev
git checkout -b feature/your-feature-name
```

### 4. Make Changes and Commit

```bash
# Stage your changes
git add .

# Commit using commitizen
npm run cz commit

# Push your branch
git push origin feature/your-feature-name
```

### 5. Create Pull Request

1. Go to GitHub repository
2. Click "Compare & pull request"
3. Select `dev` as base branch
4. Fill in the PR template
5. Request review from team members

### 6. Development Commands

```bash
# Start development server (Chrome)
pnpm run dev

# Start development server (Firefox)
pnpm run dev:firefox

# Build for production (Firefox)
pnpm run build

# Build for production (Chrome)
pnpm run build:chrome

# Run tests
pnpm run test

# Type check
pnpm run type-check

# Lint and fix
pnpm run lint:fix

# Format code
pnpm run prettier
```

---

## 📊 Release Process

### Version Bumping

We use semantic versioning for releases. Version changes should align with commit types:

- **Major**: Breaking changes or significant features
- **Minor**: New features
- **Patch**: Bug fixes and improvements

### Release Flow

```
dev ──────────────────────────────▶ main ──────────────────────────────▶ prod
     │                                │                                    │
     │  1. Merge feature PRs          │  1. Review staging tests           │
     │  2. Run integration tests      │  2. Version update                 │
     │  3. Fix any issues             │  3. Update CHANGELOG               │
     │                                │  4. Create release PR              │
     │                                │  5. Admin merge to prod            │
     │                                │  6. Tag release                    │
     │                                │  7. Deploy to production           │
     └────────────────────────────────┴────────────────────────────────────┘
```

---

## ❓ Questions?

- **Email**: mario.ramirez@gesis.org
- **GitHub Issues**: [Create an issue](https://github.com/Fersonmx/Gesis-Surf/issues)
- **GitHub Discussions**: [Start a discussion](https://github.com/Fersonmx/Gesis-Surf/discussions)

---

<div align="center">

**Happy Contributing! 🎉**

</div>

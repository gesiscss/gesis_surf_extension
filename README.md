<div align="center">
<table><tr><td bgcolor="white" style="padding: 20px;">
<img src="images/gesis.png" alt="GESIS" height="120">
</td></tr></table>

# GESIS Surf

**An Open-Source Infrastructure for Privacy-Preserving Longitudinal Web Browsing Data Collection**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.12.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5.2.2-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/react-18.2-61dafb?logo=react&logoColor=white)](https://react.dev/)
[![pnpm](https://img.shields.io/badge/pnpm-9.1.1-f69220?logo=pnpm&logoColor=white)](https://pnpm.io/)

---

[![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=gesiscss_gesis_surf_extension&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=gesiscss_gesis_surf_extension)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=gesiscss_gesis_surf_extension&metric=coverage)](https://sonarcloud.io/summary/new_code?id=gesiscss_gesis_surf_extension)
[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=gesiscss_gesis_surf_extension&metric=bugs)](https://sonarcloud.io/summary/new_code?id=gesiscss_gesis_surf_extension)
[![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=gesiscss_gesis_surf_extension&metric=code_smells)](https://sonarcloud.io/summary/new_code?id=gesiscss_gesis_surf_extension)
[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=gesiscss_gesis_surf_extension&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=gesiscss_gesis_surf_extension)
[![Duplications](https://sonarcloud.io/api/project_badges/measure?project=gesiscss_gesis_surf_extension&metric=duplicated_lines_density)](https://sonarcloud.io/summary/new_code?id=gesiscss_gesis_surf_extension)

[![SonarQube Cloud](https://sonarcloud.io/images/project_badges/sonarcloud-highlight.svg)](https://sonarcloud.io/summary/new_code?id=gesiscss_gesis_surf_extension)

---

[Features](#features) •
[Installation](#installation) •
[Usage](#development) •
[API Documentation](#architecture) •
[Contributing](#contributing) •
[License](#license)

</div>

---

GESIS Surf is an open-source research infrastructure for privacy-preserving, longitudinal collection of web browsing behavioral data at scale — combining a browser extension, REST API backend, and hierarchical session modeling to enable reproducible passive panel studies created by [GESIS – Leibniz Institute for the Social Sciences](https://www.gesis.org/).

> 🔗 **Looking for the backend?** Check out [GESIS Surf Backend](https://github.com/geomario/gesis_surf_backend)

## ✨ Features

- � **Passive Longitudinal Data Collection** - Captures naturalistic browsing behavior over time without interrupting users, enabling large-scale panel studies
- 🏗️ **Hierarchical Session Modeling** - Preserves the full structure of browsing behavior across windows, tabs, domains, and interactions
- 📄 **Content-Level Capture** - Records clicks, scrolls, DOM changes, page metadata, and full HTML snapshots per observation
- 🛡️ **Privacy-by-Design** - Strict opt-in participation, per-domain collection rules, and client-side data minimization at the point of collection
- 🌐 **Cross-Browser Support** - Works on both Chrome and Firefox via WebExtension API
- 🔐 **Secure Authentication** - Token-based authentication with secure session management
- 💾 **Client-Side Storage** - IndexedDB for local data buffering before transmission
- ♻️ **Reproducible Infrastructure** - Open-source, self-hostable backend with REST API for transparent and auditable research workflows

## 📋 Requirements

- **Node.js**: >= 18.12.0
- **Package Manager**: pnpm 9.1.1 or higher

## 🚀 Installation

Clone the repository and install dependencies:

```bash
git clone git@github.com:gesiscss/gesis_surf_extension.git
cd gesis_surf_extension
npm install
# or
pnpm install
```

## 🔨 Building the Extension

### Firefox

Build the extension for Firefox (default):

```bash
 pnpm run build:firefox
```

The compiled files will be in the `dist/` directory.

To load the extension in Firefox:
1. Navigate to `about:debugging#/runtime/this-firefox`
2. Or go to **Firefox** > **Preferences** > **Extensions & Themes** > **Debug Add-ons** > **Load Temporary Add-on...**
3. Locate and select the `dist/manifest.json` file

### Chrome

Build the extension for Google Chrome:

```bash
pnpm run build
```

The compiled files will be in the `dist/` directory.

To load the extension in Chrome:
1. Open `chrome://extensions/`
2. Enable **Developer mode** (top-right corner)
3. Click **Load unpacked**
4. Select the `dist/` directory

## 💻 Development

### Start the Development Server

For Chrome (with HMR support):

```bash
pnpm run dev
```

For Firefox (with HMR support):

```bash
pnpm run dev:firefox
```

### Available Scripts

- `pnpm run clean` - Clean build artifacts and cache
- `pnpm run build` - Build for Chrome
- `pnpm run build:firefox` - Build for Firefox
- `pnpm run dev` - Start development server (Chrome, with HMR)
- `pnpm run dev:firefox` - Start development server (Firefox, with HMR)
- `pnpm run test` - Run tests
- `pnpm run type-check` - Type-check the entire project
- `pnpm run lint` - Lint all files
- `pnpm run lint:fix` - Fix linting issues
- `pnpm run prettier` - Format code with Prettier
- `pnpm run docs` - Generate TypeDoc documentation

## 📁 Project Structure

```
├── chrome-extension/          # Chrome extension source code
│   ├── lib/                   # Core extension logic
│   │   ├── background/        # Service worker/background script
│   │   ├── controllers/       # Core extension controller
│   │   ├── db/                # Database service and configuration
│   │   ├── events/            # Event managers (Tab, Window, Domain, Content)
│   │   ├── handlers/          # Client and shared message handlers
│   │   ├── messages/          # Message interfaces and handlers
│   │   └── services/          # Auth, data collection, session, sync, policy
│   ├── public/                # Static assets (icons, CSS)
│   ├── utils/plugins/         # Vite manifest plugin
│   └── manifest.js            # Extension manifest
├── pages/                     # UI components and pages
│   ├── content/               # Content script (clicks, scrolls, HTML capture)
│   ├── popup/                 # Extension popup (React, MUI, Auth, PrivacyMode)
│   └── utils/                 # Shared page assets and ConnectedPage HOC
├── packages/                  # Shared packages and utilities
│   ├── dev-utils/             # Manifest parser, logger, and dev utilities
│   ├── hmr/                   # Hot module replacement (rollup-based)
│   ├── shared/                # Shared React hooks, storages, HOCs, and services
│   ├── tailwind-config/       # Shared Tailwind CSS configuration
│   └── tsconfig/              # Shared TypeScript configurations
└── docs/                      # Generated TypeDoc documentation
```

### Key Components

- **Background Service Worker** (`lib/background/`) - Manages extension lifecycle, coordinates all events and services
- **EventManager** (`lib/events/`) - Orchestrates Tab, Window, Domain, and Content event managers
- **Content Script** (`pages/content/`) - Injected script capturing clicks, scrolls, and HTML snapshots per page
- **Popup UI** (`pages/popup/`) - React interface for user authentication, privacy mode, and settings
- **GlobalSessionService** (`lib/services/globalSession/`) - Builds and maintains the hierarchical session model across windows and tabs
- **PolicyService** (`lib/services/policyService/`) - Enforces per-domain and per-content collection rules (privacy-by-design)
- **AuthService** (`lib/services/authService/`) - Token-based authentication and session management
- **DatabaseService** (`lib/db/`) - IndexedDB client-side data buffering before transmission
- **DataCollectionService** (`lib/services/dataCollectionService/`) - Aggregates and processes collected interaction data
- **SyncService** (`lib/services/syncService/`) - Handles periodic data synchronization to the backend API
- **PrivateModeService** (`lib/services/privateModeService/`) - User-controlled privacy mode with timed activation
- **MessageHandler** (`lib/messages/`) - Typed message passing between background, content, and popup scripts

## 🏗️ Architecture

### Extension Architecture

The extension follows a modular architecture:

- **Background Script (Service Worker)** - Manages extension state and coordinates events
- **Content Script** - Collects user interaction data from web pages
- **Popup UI** - Provides user authentication and privacy controls
- **Message Passing** - Secure communication between background, content, and popup scripts
- **IndexedDB** - Local storage for data persistence

### System Integration

```
┌─────────────────────┐
│  Browser Extension  │
├─────────────────────┤
│ - Content Script    │  Collects: clicks, scrolls, HTML snapshots,
│ - Background Worker │           domains, tab/window events,
│ - Popup UI          │           session hierarchy, host policy
│ - IndexedDB Storage │
└──────────┬──────────┘
           │ HTTPS/Secure
           │ Authentication
           ▼
┌─────────────────────┐
│  Django Backend     │
├─────────────────────┤
│ - REST API          │  Processes: user registration,
│ - Token Auth        │  authentication, data aggregation,
│ - Database          │  analysis & reporting
│ - Celery/Redis      │
│ - Elasticsearch     │
└─────────────────────┘
```

**Data Flow:**
1. On startup/install, `AuthService` validates the stored token against `/api/user/me/`
2. If authenticated, `HostService` syncs the domain blocklist/allowlist from `/api/host/hosts/`
3. `GlobalSessionService` creates a hierarchical session (global → window → tab → domain) and posts it to `/api/session/`
4. `EventManager` starts `TabEventManager`, `WindowEventManager`, `DomainEventManager`, and `ContentEventManager`
5. Content script captures **clicks**, **scrolls**, and **HTML snapshots** (with meta tags) and sends them via message passing to the background service worker
6. Background worker writes events to **IndexedDB** via `DatabaseService` for local buffering
7. Events are flushed to the backend API (`/api/clicks/`, `/api/scrolls/`, `/api/tab/tabs/`, `/api/domain/domains/`)
8. `HeartbeatService` runs every 10 seconds to maintain extension liveness state
9. `PrivateModeService` suspends data collection when the user activates privacy mode

## 🤝 Contributing

We welcome contributions! Please see our **[Contributing Guide](CONTRIBUTING.md)** for detailed information on:

- 🌿 **Branching Strategy** - `dev` → `main` → `prod` workflow
- 📝 **Commit Conventions** - Using Commitizen with Conventional Commits
- 🔍 **Code Quality** - Pre-commit hooks, linting, and formatting
- 🔀 **Pull Request Process** - Guidelines and review workflow

### Quick Start

1. **Fork** the repository
2. **Create** a feature branch from `dev`
   ```bash
   git checkout dev && git pull origin dev
   git checkout -b feature/amazing-feature
   ```
3. **Install pre-commit hooks**
   ```bash
   pnpm install
   pnpm run prepare
   ```
4. **Commit using Commitizen**
   ```bash
   git add .
   pnpm cz
   ```
5. **Push and open a Pull Request** targeting `dev`

## ✅ Code Quality

This project uses:

- **ESLint** - For code linting
- **Prettier** - For code formatting
- **TypeScript** - For type safety
- **Husky** - For pre-commit and commit-msg hooks
- **lint-staged** - For running linters on staged files
- **commitlint** - Enforces Conventional Commits format on every commit message

Run quality checks:

```bash
pnpm run lint
pnpm run lint:fix
pnpm run type-check
pnpm run prettier
```

## 📦 Technology Stack

- **UI**: React 18, React Router v6, MUI v6 (Material UI), Emotion, Tailwind CSS
- **Build Tools**: Vite 6, Turbo (monorepo task runner), Rollup (HMR package)
- **Language**: TypeScript 5.9
- **Storage**: IndexedDB via `idb` library
- **Browser APIs**: WebExtension API with `webextension-polyfill`
- **Unique IDs**: `uuid` v11 for session identifier generation
- **Code Quality**: ESLint (Airbnb TypeScript config), Prettier, Husky, lint-staged, commitlint
- **Commit Tooling**: Commitizen (`cz-conventional-changelog`), commitlint (`@commitlint/config-conventional`)
- **Package Manager**: pnpm 9.1.1 (workspace monorepo)

## 📄 License

This project is licensed under the MIT License - see the [`LICENSE`](LICENSE) file for details.

Copyright © 2023-2025 [GESIS – Leibniz Institute for the Social Sciences](https://www.gesis.org/)

## 🔗 Backend Integration

The GESIS Surf Extension works in conjunction with the **GESIS Surf Backend** for data processing and storage.

### Related Repositories

- **[GESIS Surf Backend](https://github.com/geomario/gesis_surf_backend)** - Django REST API for data collection, user management, and research analysis
  - Built with Django 4.2 and Python 3.10+
  - PostgreSQL for persistent storage
  - Celery/Redis for async task processing
  - Elasticsearch for fast data retrieval
  - Docker-ready deployment

### Data Collection Endpoints

The extension communicates with the backend API for:

| Endpoint                    | Purpose                                              |
| -------------------------- | ---------------------------------------------------- |
| `/api/user/token/`         | Authentication token generation                      |
| `/api/user/me/`            | User profile and data collection status              |
| `/api/session/`            | Global session hierarchy submission                  |
| `/api/tab/tabs/`           | Browser tab event tracking                           |
| `/api/domain/domains/`     | Domain classification and event tracking             |
| `/api/clicks/`             | Click event submission                               |
| `/api/scrolls/`            | Scroll event submission                              |
| `/api/host/hosts/`         | Host blocklist/allowlist sync (policy rules)         |
| `/api/host/task-result/`   | Async host sync task polling                         |
| `/api/selectors/`          | Dynamic LLM-based CSS selector retrieval             |
| `/api/selectors/task-result/` | Async selector task polling                       |

## 👥 Authors

- **Mario Ramirez** - _Lead Research Software Engineer_ - [@geomario](https://github.com/geomario) [@MarioGesis](https://www.gesis.org/en/institute/about-us/staff/person/mario.ramirez)
- **Fernando Guzman** - _Software Architect Consultant_ - [@Fernando](https://www.linkedin.com/in/fernando-guzman-9262801b/)
- **Dr. Sebastian Stier** - _Department Director CSS_ [@Seb](https://www.gesis.org/en/institute/about-us/staff/person/sebastian.stier)
- **Dr. Frank Mangold** - _Kommissarischer Teamleiter DDD_ [@Frank](https://www.gesis.org/institut/ueber-uns/mitarbeitendenverzeichnis/person/Frank.Mangold)

## 🙏 Acknowledgments

- [GESIS - Leibniz Institute for the Social Sciences](https://www.gesis.org/)
- [Computational Social Science Department](https://www.gesis.org/en/institute/about-us/departments/computational-social-science)

## 🔒 Privacy Notice

This extension is designed with privacy in mind. Data collection is:
- **Transparent** - Users know what data is being collected
- **Ethical** - Complies with research ethics standards
- **Secure** - Uses secure authentication and storage mechanisms
- **User-Controlled** - Includes privacy mode and user controls

For detailed privacy information, please refer to the project's privacy documentation or contact GESIS directly.

## 📧 Contact

Questions or feedback? Reach out!

- **GitHub Issues**: [Create an issue](https://github.com/gesiscss/gesis_surf_extension/issues)
- **Backend Issues**: [Backend Repository](https://github.com/geomario/gesis_surf_backend/issues)
- **GESIS**: https://www.gesis.org/

## 📝 Citation

If you use this software in your research, please cite:

```bibtex
@article{ramirez2025gesis,
  title = {GESIS Surf Extension},
  author = {Ramirez, Mario and Guzman, Fernando and Stier, Sebastian and Mangold, Frank},
  journal = {SoftwareX},
  volume = {XX},
  pages = {XXXXXX},
  year = {2026},
  publisher = {Elsevier},
  doi = {10.1016/j.softx.2025.xxxxxx}
}
```

See [`CITATION.cff`](CITATION.cff) for more citation formats.

---

<div align="center">
Made with ❤️ at GESIS
</div>

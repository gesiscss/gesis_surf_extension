<div align="center">
<table><tr><td bgcolor="white" style="padding: 20px;">
<img src="images/gesis_logo.svg" alt="GESIS" width="150" height="50">
</td></tr></table>

# GESIS Surf Extension

**Browser extension for researching online behavior and user privacy**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.12.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5.2.2-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/react-18.2-61dafb?logo=react&logoColor=white)](https://react.dev/)
[![pnpm](https://img.shields.io/badge/pnpm-9.1.1-f69220?logo=pnpm&logoColor=white)](https://pnpm.io/)

[✨ Features](#-features) •
[🚀 Installation](#-installation) •
[💻 Development](#-development) •
[🏗️ Architecture](#-architecture) •
[🤝 Contributing](#-contributing) •
[📄 License](#-license) •
[📧 Contact](#-contact)

</div>

---

GESIS Surf is a scientific study conducted by [GESIS – Leibniz Institute for the Social Sciences](https://www.gesis.org/) to understand how people browse the internet in Germany.

> 🔗 **Looking for the backend?** Check out [GESIS Surf Backend](https://github.com/geomario/gesis_surf_backend)

## ✨ Features

- 🔍 **Privacy-Conscious Data Collection** - Ethical research on online browsing behavior
- 🔐 **Secure Authentication** - Built-in authentication service with secure token management
- 🌐 **Cross-Browser Support** - Works on both Firefox and Google Chrome
- 📊 **Real-time Monitoring** - Track user interactions including clicks, scroll behavior, and DOM changes
- 🛡️ **Privacy Mode** - Optional privacy controls with configurable timers
- 💾 **IndexedDB Storage** - Efficient client-side data management
- ⚡ **Hot Module Replacement** - Fast development workflow with HMR support

## 📋 Requirements

- **Node.js**: >= 18.12.0
- **Package Manager**: pnpm 9.1.1 or higher

## 🚀 Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/Fersonmx/Gesis-Surf.git
cd Gesis-Surf
npm install
# or
pnpm install
```

## 🔨 Building the Extension

### Firefox

Build the extension for Firefox (default):

```bash
npm run build
```

The compiled files will be in the `dist/` directory.

To load the extension in Firefox:
1. Navigate to `about:debugging#/runtime/this-firefox`
2. Or go to **Firefox** > **Preferences** > **Extensions & Themes** > **Debug Add-ons** > **Load Temporary Add-on...**
3. Locate and select the `dist/manifest.json` file

### Chrome

Build the extension for Google Chrome:

```bash
npm run build:chrome
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
npm run dev
```

For Firefox (with HMR support):

```bash
npm run dev:firefox
```

### Available Scripts

- `npm run clean` - Clean build artifacts and cache
- `npm run build` - Build for Firefox
- `npm run build:chrome` - Build for Chrome
- `npm run dev` - Start development server (Chrome)
- `npm run dev:firefox` - Start development server (Firefox)
- `npm run test` - Run tests
- `npm run type-check` - Type-check the entire project
- `npm run lint` - Lint all files
- `npm run lint:fix` - Fix linting issues
- `npm run prettier` - Format code with Prettier
- `npm run docs` - Generate TypeDoc documentation

## 📁 Project Structure

```
├── chrome-extension/          # Chrome extension source code
│   ├── lib/                   # Core extension logic
│   │   ├── background/        # Service worker/background script
│   │   ├── events/            # Event managers and handlers
│   │   ├── handlers/          # Message and content handlers
│   │   ├── services/          # Authentication, data collection, sync
│   │   ├── db/                # Database service and configuration
│   │   └── messages/          # Message handling
│   ├── public/                # Static assets
│   └── manifest.js            # Extension manifest
├── pages/                     # UI components and pages
│   ├── popup/                 # Extension popup interface
│   │   └── src/components/    # React components (Login, PrivacyMode, etc.)
│   └── content/               # Content script for page interaction
├── packages/                  # Shared packages and utilities
│   ├── shared/                # Shared React hooks, services, and utilities
│   ├── hmr/                   # Hot module replacement utilities
│   ├── dev-utils/             # Development utilities
│   └── tsconfig/              # Shared TypeScript configurations
└── docs/                      # Generated TypeDoc documentation
```

### Key Components

- **background.ts** - Main service worker that manages extension lifecycle and events
- **content-script** - Injected script that collects page interaction data (clicks, scrolls, DOM changes)
- **index.html** - Popup UI for user authentication and settings
- **AuthService** - Handles authentication and token management
- **DatabaseService** - Manages IndexedDB for client-side data storage
- **EventManager** - Coordinates events from tabs, windows, and content scripts
- **DataCollectionService** - Processes and manages collected user interaction data

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
│ - Content Script    │  Collects: clicks, scrolls, DOM changes,
│ - Background Worker │           domains, tab/window events
│ - Popup UI          │
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
1. Extension collects user interaction data locally
2. Data is sent to backend API via secure HTTPS connection
3. Backend processes and stores data in PostgreSQL
4. Celery tasks handle async processing
5. Elasticsearch indexes data for fast retrieval
6. Research team analyzes aggregated, anonymized data

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
   npm run cz commit
   ```
5. **Push and open a Pull Request** targeting `dev`

## ✅ Code Quality

This project uses:

- **ESLint** - For code linting
- **Prettier** - For code formatting
- **TypeScript** - For type safety
- **Husky** - For pre-commit hooks
- **lint-staged** - For running linters on staged files

Run quality checks:

```bash
npm run lint
npm run lint:fix
npm run type-check
npm run prettier
```

## 📦 Technology Stack

- **Frontend**: React 18, React Router, Tailwind CSS
- **Build Tools**: Vite, Turbo (monorepo)
- **Language**: TypeScript
- **Storage**: IndexedDB
- **Browser APIs**: WebExtension API with polyfill support
- **Development**: Husky, lint-staged, Prettier

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

| Endpoint              | Purpose                                    |
| -------------------- | ------------------------------------------ |
| `/api/user/`         | User registration and profile management   |
| `/api/user/token/`   | Authentication token generation            |
| `/api/window/`       | Browser window tracking                    |
| `/api/tab/`          | Browser tab monitoring                     |
| `/api/domain/`       | Domain information and classification      |
| `/api/clicks/`       | Click event submission                     |
| `/api/scrolls/`      | Scroll event submission                    |
| `/api/html/`         | DOM content and page structure data        |

## 👥 Authors

- **Mario Ramirez** - _Lead Research Software Engineer_ - [@geomario](https://github.com/geomario) [@MarioGesis](https://www.gesis.org/en/institute/about-us/staff/person/mario.ramirez)
- **Fernando Guzman** - _Software Architect Consultant_ - [@Fernando](https://www.linkedin.com/in/fernando-guzman-9262801b/)
- **Prof. Dr. Sebastian Stier** - _Department Director CSS_ [@Seb](https://www.gesis.org/en/institute/about-us/staff/person/sebastian.stier)
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

- **GitHub Issues**: [Create an issue](https://github.com/Fersonmx/Gesis-Surf/issues)
- **Backend Issues**: [Backend Repository](https://github.com/geomario/gesis_surf_backend/issues)
- **GESIS**: https://www.gesis.org/

## 📝 Citation

If you use this software in your research, please cite:

```bibtex
@article{ramirez2025gesis,
  title = {GESIS Surf Extension},
  author = {Ramirez, Mario and },
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

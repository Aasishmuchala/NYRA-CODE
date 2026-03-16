# Changelog

All notable changes to NYRA Desktop are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-03-16

### Added

#### Core Features
- **Multi-Provider AI Support**: Seamlessly integrate with OpenAI, Anthropic Claude, Google Gemini, Microsoft Copilot, and local Ollama models
- **OpenClaw Gateway Integration**: Direct integration with OpenClaw's intelligent routing and load balancing
- **7-Step Onboarding Wizard**: Guided setup for first-time users with API key configuration and preference selection

#### Channel Messaging
- Support for 8+ messaging platforms: Telegram, Discord, Slack, WhatsApp, Matrix, Signal, IRC, and Google Chat
- Bidirectional message synchronization
- Channel-specific conversation threading
- Rich media support (images, files, documents)

#### Agent Framework
- Custom agent creation with visual builder
- 6 built-in agent templates:
  - Research Assistant
  - Code Generator
  - Content Writer
  - Data Analyst
  - Customer Support Bot
  - Personal Productivity Manager
- Agent configuration with custom instructions and behaviors
- Agent marketplace for community templates

#### Memory System
- 4-tier semantic memory architecture:
  1. **Immediate**: Current conversation context (session-based)
  2. **Contextual**: Recent interactions and related topics (24-hour window)
  3. **Persistent**: Long-term knowledge base and user preferences (unlimited retention)
  4. **Episodic**: Indexed conversation history with semantic search
- Automatic memory management with configurable retention policies
- Memory visualization dashboard

#### Computer Use
- Visual desktop interaction capability
- Automated task execution
- Screenshot analysis and understanding
- Cursor and keyboard automation
- Safe sandboxing for automated operations

#### Voice Interface
- Real-time speech-to-text transcription
- Natural language voice commands
- Multi-language support (30+ languages)
- Wake-word detection (customizable)
- Voice response generation with natural prosody

#### Plugin System
- Plugin SDK for extending functionality
- Plugin marketplace and discovery
- Hot-reload support for plugin development
- Security sandboxing for plugins
- Example plugins included

#### Conversation Features
- Conversation branching for exploring alternative paths
- Version history and rollback
- Conversation tagging and organization
- Export to Markdown, PDF, or plain text
- Collaboration features (comments, mentions)

#### Search & Discovery
- Global search across all conversations
- Full-text and semantic search
- Search filters (date, agent, provider, channel)
- Saved searches and search history
- Quick search from any screen (Cmd/Ctrl+K)

#### Activity & Analytics
- Activity feed showing all interactions
- Conversation timeline view
- Usage statistics and analytics
- Provider cost tracking
- Performance metrics per agent

#### Backup & Data Management
- Automatic incremental backups
- Manual backup creation and restoration
- Encrypted backup storage
- Cloud backup integration (Google Drive, Dropbox, OneDrive)
- Data export in multiple formats

#### Prompt Library
- Pre-built prompt templates
- Category organization (writing, coding, analysis, etc.)
- Prompt versioning and favorites
- Community prompt sharing
- Custom prompt creation and management

#### Task Board
- Kanban-style task management
- Integration with AI agents
- Due dates and reminders
- Task templates
- Progress tracking

#### Theme Engine
- Light and dark mode support
- Custom theme creation
- Font and accent color customization
- Keyboard shortcut configuration
- Accessibility themes (high contrast, dyslexia-friendly)

#### Auto-Updater
- Background update checking
- One-click updates
- Automatic security patches
- Update notifications
- Rollback capability

### Technical Highlights
- Built with Electron + React + TypeScript
- Modern UI with Tailwind CSS
- Secure credential management
- Offline-first architecture with sync
- Cross-platform support (macOS, Windows, Linux)
- Performance optimized for resource constraints
- Comprehensive error handling and logging
- Security audit ready

### Documentation
- Full API documentation
- Plugin development guide
- User guide and tutorials
- Architecture documentation
- Contributing guidelines
- Troubleshooting guide

---

[Unreleased]: https://github.com/nyra-ai/nyra-desktop/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/nyra-ai/nyra-desktop/releases/tag/v1.0.0

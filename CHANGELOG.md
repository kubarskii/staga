# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-01-01

### Added
- Initial release of Staga library
- StateManager with undo/redo functionality and snapshots
- Transaction system with step execution and rollback support
- Middleware system for extensible cross-cutting concerns
- Built-in middleware for persistence, logging, and timing
- Event system for monitoring transaction lifecycle
- Full TypeScript support with strict typing
- Comprehensive test suite
- Complete documentation and examples
- Retry mechanism with configurable attempts
- Timeout support for individual steps
- Structured error handling and compensation functions

### Features
- 🔄 **Transaction Management**: Execute multiple steps as atomic operations
- ⏪ **Undo/Redo**: Built-in state management with history
- 🔁 **Retry Logic**: Configurable retry mechanisms for failed steps
- ⏱️ **Timeout Support**: Set timeouts for individual steps
- 🔌 **Middleware**: Extensible middleware system
- 💾 **Persistence**: Built-in persistence middleware
- 📦 **TypeScript**: Full TypeScript support
- 🎯 **Events**: Monitor transaction lifecycle
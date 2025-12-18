#!/bin/bash
# Setup script for pre-commit hooks

set -e

echo "🔧 Setting up pre-commit hooks for Pabawi..."

# Check if pre-commit is installed
if ! command -v pre-commit &> /dev/null; then
    echo "❌ pre-commit is not installed"
    echo ""
    echo "Please install pre-commit using one of these methods:"
    echo ""
    echo "  Using pip:"
    echo "    pip install pre-commit"
    echo ""
    echo "  Using homebrew (macOS):"
    echo "    brew install pre-commit"
    echo ""
    echo "  Using pipx:"
    echo "    pipx install pre-commit"
    echo ""
    exit 1
fi

echo "✅ pre-commit is installed"

# Install git hooks
echo "📦 Installing git hooks..."
pre-commit install
pre-commit install --hook-type commit-msg

echo "✅ Git hooks installed"

# Run hooks on all files to verify setup
echo "🧪 Running pre-commit on all files (this may take a moment)..."
if pre-commit run --all-files; then
    echo "✅ All pre-commit checks passed!"
else
    echo "⚠️  Some checks failed. Please review and fix the issues above."
    echo "    You can run 'npm run lint:fix' to auto-fix some issues."
    exit 1
fi

echo ""
echo "🎉 Pre-commit setup complete!"
echo ""
echo "Available commands:"
echo "  npm run precommit          - Run all hooks manually"
echo "  npm run precommit:update   - Update hooks to latest versions"
echo "  npm run lint:fix           - Auto-fix linting issues"

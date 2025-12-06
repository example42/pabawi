---
inclusion: always
---

# Documentation Organization Standards

## Directory Structure

### `/docs` - User-Facing Documentation

- Contains **only** current, production-ready documentation
- Intended for end users, operators, and external contributors
- Examples: API documentation, user guides, setup instructions, troubleshooting guides
- Keep content stable and well-maintained

### `/.kiro` - Development and AI-Generated Content

- All Kiro-generated documentation, notes, and development artifacts
- Temporary analysis, research, and working documents
- AI assistant conversation outputs and generated summaries
- Development-specific documentation not relevant to end users

### `/.kiro/todo` - Action Items and Issues

- Bug reports and lint issues to be addressed
- Feature requests and enhancement ideas
- Technical debt tracking
- Refactoring tasks and code quality improvements

## Rules for AI Assistants

1. **Never create documentation files in `/docs` unless explicitly requested by the user**
2. **Do not create summary markdown files** after completing work unless the user specifically asks for them
3. When generating analysis, notes, or working documents, place them in `/.kiro/` subdirectories
4. When identifying bugs, lints, or tasks, document them in `/.kiro/todo/`
5. Keep `/docs` clean - only update existing documentation or add new docs when explicitly instructed
6. Avoid creating duplicate documentation across directories

## When to Update `/docs`

- User explicitly requests documentation updates
- Fixing errors or outdated information in existing docs
- Adding new features that require user-facing documentation
- Updating API specifications or configuration guides

## When to Use `/.kiro`

- Storing AI-generated analysis or summaries
- Development notes and research
- Temporary working documents
- Spec files and implementation plans
- Steering documents and project conventions

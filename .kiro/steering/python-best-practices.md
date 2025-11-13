---
title: Python Best Practices
inclusion: fileMatch
fileMatchPattern: '*.py'
---

# Python Best Practices

## Code Style
- Follow PEP 8 style guide
- Use meaningful variable and function names
- Use snake_case for variables and functions
- Use PascalCase for classes
- Use UPPER_SNAKE_CASE for constants
- Limit line length to 88 characters (Black formatter)

## Type Hints
- Use type hints for function parameters and return values
- Import types from `typing` module when needed
- Use `Optional` for nullable values
- Use `Union` for multiple possible types

## Error Handling
- Use specific exception types
- Handle exceptions at appropriate levels
- Use context managers (`with` statements) for resource management
- Log errors with appropriate detail

## Code Organization
- Use virtual environments for dependencies
- Create requirements.txt or use poetry/pipenv
- Organize code into modules and packages
- Use `__init__.py` files appropriately

## Testing
- Write unit tests using pytest
- Use descriptive test function names
- Mock external dependencies
- Aim for high test coverage
- Use fixtures for test setup
- Run tests with minimal output: `pytest -q` or `python -m pytest --tb=short -q`
- Filter specific tests: `pytest -k "test_name"` to avoid running full suites

## Performance
- Use list comprehensions over loops when appropriate
- Use generators for large datasets
- Profile code before optimizing
- Use appropriate data structures (sets, dicts, etc.)
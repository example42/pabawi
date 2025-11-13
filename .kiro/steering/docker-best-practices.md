---
title: Docker Best Practices
inclusion: fileMatch
fileMatchPattern: 'Dockerfile*,docker-compose*,*.dockerfile'
---

# Docker Best Practices

## Dockerfile Optimization
- Use multi-stage builds to reduce image size
- Use specific base image tags, avoid `latest`
- Minimize layers by combining RUN commands
- Use `.dockerignore` to exclude unnecessary files
- Run as non-root user when possible

## Security
- Scan images for vulnerabilities
- Use minimal base images (alpine, distroless)
- Don't include secrets in images
- Use secrets management for sensitive data
- Keep base images updated

## Performance
- Order layers from least to most frequently changing
- Use build cache effectively
- Minimize context size
- Use appropriate COPY vs ADD commands

## Best Practices
- Use LABEL for metadata
- Set appropriate WORKDIR
- Use EXPOSE for documentation
- Use health checks when appropriate
- Clean up package manager caches
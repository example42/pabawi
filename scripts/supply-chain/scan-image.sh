#!/usr/bin/env bash
set -euo pipefail
image=${1:?Usage: scan-image.sh IMAGE OUTPUT_DIRECTORY}
output=${2:?Output directory required}
mkdir -p "$output"
output=$(cd "$output" && pwd)
scanner=aquasec/trivy:0.69.3@sha256:bcc376de8d77cfe086a917230e818dc9f8528e3c852f7b1aff648949b6258d1c
mkdir -p "$output/cache"
docker image inspect "$image" > "$output/image.json"
docker save "$image" -o "$output/image.tar"
# Scan the exported artifact without granting the scanner access to the Docker socket.
docker run --rm -v "$output:/scan" -v "$output/cache:/root/.cache/trivy" "$scanner" --quiet image --input /scan/image.tar \
  --format cyclonedx --output /scan/sbom.cdx.json
docker run --rm -v "$output:/scan" -v "$output/cache:/root/.cache/trivy" "$scanner" --quiet image --input /scan/image.tar \
  --scanners vuln --format json --output /scan/vulnerabilities.json
docker run --rm -v "$output:/scan" -v "$output/cache:/root/.cache/trivy" "$scanner" --quiet image --input /scan/image.tar \
  --scanners vuln --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1

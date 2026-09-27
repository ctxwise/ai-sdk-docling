#!/usr/bin/env bash
# Peak docling memory at a given server size: restarts docling with the limits, samples container memory
# every second while memory.ts runs.
# usage (repo root): dotenvx run -- bash bench/scripts/memory.sh <label> <cpus> <memory> <workers>
#   e.g. dotenvx run -- bash bench/scripts/memory.sh 4vcpu 4 16g 2   -> bench/data/mem-4vcpu-{samples.csv,phases.json}
set -euo pipefail
label=$1 cpus=$2 mem=$3 workers=$4
container=ai-sdk-docling-docling-1
DOCLING_WORKERS=$workers docker compose up -d --force-recreate >/dev/null 2>&1
docker update --cpus "$cpus" --memory "$mem" --memory-swap "$mem" "$container" >/dev/null
until curl -sf -H "x-api-key: $DOCLING_API_KEY" localhost:5001/health >/dev/null; do sleep 2; done

out=bench/data/mem-$label-samples.csv
echo "t,mib" > "$out"
( while true; do
    m=$(docker stats --no-stream --format '{{.MemUsage}}' "$container" | awk '{print $1}')
    v=$(echo "$m" | sed 's/GiB//;s/MiB//'); case "$m" in *GiB) v=$(awk "BEGIN{print $v*1024}");; esac
    echo "$(date +%s),$v" >> "$out"; sleep 1
  done ) &
sampler=$!
trap 'kill $sampler' EXIT
node bench/scripts/memory.ts "$label"
echo "peak MiB: $(sort -t, -k2 -n "$out" | tail -1 | cut -d, -f2)  idle MiB: $(sed -n 3p "$out" | cut -d, -f2)"

#!/usr/bin/env bash
# Run ON the production server (via SSH) while a k6 test runs from your
# laptop, to record resource usage over time — timestamped, so a
# response-time spike in k6's output can be correlated against which
# container was struggling at that moment.
#
# Usage (from your laptop):
#   ssh deploy@<server-ip> 'bash -s' < load-tests/monitor.sh > monitor.log &
#   # ... run your k6 test ...
#   kill %1   # stop the monitor once the test is done
#
# Or, run directly on the server in its own session:
#   ./monitor.sh [output_file] [interval_seconds]
#   ./monitor.sh                      # -> monitor-<timestamp>.log, 1s interval
#   ./monitor.sh out.log 2            # custom file + 2s interval
#   Stop with Ctrl+C.
#
# Depends only on docker (already required by the stack) + coreutils/procps
# tools present on stock Ubuntu — no extra install needed.

set -uo pipefail

OUT="${1:-monitor-$(date +%Y%m%d-%H%M%S).log}"
INTERVAL="${2:-1}"

# When piped in via `ssh ... 'bash -s' < monitor.sh > monitor.log`, stdout is
# the caller's redirect target — write status/progress to stderr instead so
# it doesn't corrupt the log file, and write samples straight to stdout.
echo "Sampling every ${INTERVAL}s. Ctrl+C (or 'kill' the ssh process) to stop." >&2
echo "(if run standalone rather than piped, samples also go to: $OUT)" >&2

sample() {
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"
  echo "=== $ts ==="

  # Per-container CPU %, memory usage/limit, memory %, network I/O, block I/O.
  # --no-stream takes one instantaneous sample instead of streaming.
  echo "--- containers ---"
  docker stats --no-stream --format \
    'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}' \
    2>/dev/null || echo "docker stats failed (is docker running / are you in the docker group?)"

  # Overall host CPU/memory/load — the compose stack's ultimate ceiling
  # (4 vCPU / 8 GB total on the CX33 box per deployment.md).
  echo "--- host ---"
  echo -n "load_average_1_5_15: "
  cut -d' ' -f1-3 /proc/loadavg 2>/dev/null || uptime
  free -h 2>/dev/null | awk 'NR==1 || NR==2'
  echo -n "cpu_idle_pct: "
  top -bn1 2>/dev/null | grep -i "Cpu(s)" | awk -F',' '{for(i=1;i<=NF;i++){if($i ~ /id/){gsub(/[^0-9.]/,"",$i);print $i}}}'

  echo
}

# Run indefinitely until interrupted; each iteration takes negligible time
# relative to INTERVAL, so this is close enough to true ${INTERVAL}s sampling
# for correlating against k6's own timestamps (no claim of sub-second
# precision). `tee -a` covers both invocation styles from the usage comment
# above: piped via ssh (the caller's redirect captures stdout into their own
# local file) and run standalone on the server (writes to $OUT directly).
while true; do
  sample | tee -a "$OUT"
  sleep "$INTERVAL"
done

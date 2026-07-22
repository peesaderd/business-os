#!/usr/bin/env bash
# POD Wizard E2E Test Runner
# Usage: ./run_e2e.sh [--auto-fix] [--verbose]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="${SCRIPT_DIR}/test-reports"
TIMESTAMP=$(date '+%Y-%m-%d_%H-%M-%S')
LOG_FILE="${LOG_DIR}/e2e-${TIMESTAMP}.log"
POD_URL="${POD_URL:-https://podwizard.m2igen.com}"
SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"

mkdir -p "${LOG_DIR}"

echo "🧪 POD Wizard E2E Test — $(date '+%Y-%m-%d %H:%M:%S')"
echo "   Target: ${POD_URL}"
echo "   Log:    ${LOG_FILE}"
echo ""

cd "${SCRIPT_DIR}"

# Run tests
python3 test_e2e.py 2>&1 | tee "${LOG_FILE}"
EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ ALL TESTS PASSED"
else
    echo "❌ SOME TESTS FAILED (exit code ${EXIT_CODE})"
    # Alert if webhook configured
    if [ -n "${SLACK_WEBHOOK}" ]; then
        SUMMARY=$(grep -E "(FAIL|Results:)" "${LOG_FILE}" | tail -5)
        curl -s -X POST "${SLACK_WEBHOOK}" \
            -H "Content-Type: application/json" \
            -d "{\"text\":\"❌ POD Wizard E2E FAILED\\n${SUMMARY}\\nLog: podwizard.m2igen.com/test-reports/e2e-${TIMESTAMP}.log\"}"
    fi
fi

exit $EXIT_CODE

#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

stamp="$(date -u '+%Y-%m-%d %H:%M UTC')"
result="OK"
reason="syntax and tests passed"

if ! node --check index.js >/tmp/tsarafandray_node_check.log 2>&1; then
  result="FAILED"
  reason="node --check failed"
else
  if [ -f test_conversation_router.js ] && ! node test_conversation_router.js >/tmp/tsarafandray_router_test.log 2>&1; then
    result="FAILED"
    reason="conversation router tests failed"
  fi
  if [ "$result" = "OK" ] && [ -f test_translation_logic.js ] && ! node test_translation_logic.js >/tmp/tsarafandray_translation_test.log 2>&1; then
    result="FAILED"
    reason="translation tests failed"
  fi
  if [ "$result" = "OK" ] && [ -f test_teacher_module.js ] && ! node test_teacher_module.js >/tmp/tsarafandray_teacher_test.log 2>&1; then
    result="FAILED"
    reason="teacher module tests failed"
  fi
  if [ "$result" = "OK" ] && [ -f test_referentiel_module.js ] && ! node test_referentiel_module.js >/tmp/tsarafandray_referentiel_test.log 2>&1; then
    result="FAILED"
    reason="referentiel tests failed"
  fi
fi

printf '\n`%s` — contrôle horaire — %s — %s\n' "$stamp" "$result" "$reason" >> CHANGELOG_AUTONOME.md

if [ "$result" != "OK" ]; then
  cat /tmp/tsarafandray_node_check.log /tmp/tsarafandray_router_test.log /tmp/tsarafandray_translation_test.log /tmp/tsarafandray_teacher_test.log /tmp/tsarafandray_referentiel_test.log 2>/dev/null || true
  exit 1
fi

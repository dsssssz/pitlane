#!/usr/bin/env bash
# Убрать тестовые результаты владельца из топов (строки test:true в drag:0-100, drag:100-200, drag:402m, lap:sochi + ptops:<pid>)
set -e; cd "$(dirname "$0")/.." && node scripts/owner-test-tops.mjs remove

#!/usr/bin/env bash
# Stands in for `opencode run`: prints a recorded event stream and leaves a marker file.
if [ -n "$FAKE_SLEEP" ]; then sleep "$FAKE_SLEEP"; fi
cat "$(dirname "$0")/run.jsonl"
echo ok > ./done.txt

#!/usr/bin/env bash
# Stands in for opencode with Tony: writes one gate status line, as the plugin does when TONY_STATUS_FILE is set.
cat "$(dirname "$0")/run.jsonl"
echo '{"sessionID":"s","status":"verified","rounds":1,"checks":[],"pending":[],"testsChanged":[]}' >> "$TONY_STATUS_FILE"

#!/usr/bin/env bash
set -euo pipefail

ADDR="${1:-}"

if [[ -z "$ADDR" ]]; then
    echo "Usage: $0 <MAC>"
    exit 1
fi

echo "Using device: $ADDR"

{
	echo "remove $ADDR"
	echo "scan on"
	sleep 10
	echo "pair $ADDR"
	sleep 5
	echo "trust $ADDR"
	echo "connect $ADDR"
	sleep 3
	echo "scan off"
	echo "info $ADDR"
	echo "quit"
} | bluetoothctl

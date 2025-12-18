#!/usr/bin/env bash

# Usage:
#   ./print_files.sh .ts .svelte .js
#
# Description:
#   From the current directory, recursively finds all files whose names
#   end with any of the provided suffixes and prints:
#     - the file path
#     - the file contents
#   in a readable, separated format.

if [ "$#" -eq 0 ]; then
    echo "Error: provide at least one file ending (e.g. .ts .svelte)"
    exit 1
fi

for ending in "$@"; do
    find . -type f -name "*${ending}" | while IFS= read -r file; do
        echo "=============================="
        echo "FILE: ${file}"
        echo "=============================="
        cat "${file}"
        echo
    done
done

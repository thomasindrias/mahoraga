---
description: Suppress or manage false-positive issues
argument-hint: <fingerprint> [--reason "..."] | --list | --undo <fingerprint>
allowed-tools: Bash(npx:*)
---

Parse the user's intent from the arguments:

- **Suppress**: `npx mahoraga-cli dismiss <fingerprint> --reason "reason text"`
- **List suppressions**: `npx mahoraga-cli dismiss --list`
- **Undo suppression**: `npx mahoraga-cli dismiss --undo <fingerprint>`

If no arguments were provided, ask the user what they want to do: suppress a specific issue (needs fingerprint), list existing suppressions, or undo a suppression.

After the command completes, confirm the action taken and summarize the result.

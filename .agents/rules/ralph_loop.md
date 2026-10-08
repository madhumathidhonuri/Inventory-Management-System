# Autonomous Execution & Self-Correction (Ralph Loop)

Whenever implementing code changes, bug fixes, or new features in this Inventory Management System:

## 1. The Autonomous Feedback Cycle
Always follow the closed-loop cycle:
1. **Plan & Edit**: Read relevant files and make targeted modifications.
2. **Execute Verification**: Run relevant tests, linters, or verification scripts:
   - Backend verification: `node backend/src/scripts/test_sync.js` or route test scripts.
   - Frontend build check: `npm --prefix frontend run build` (or check for Vite syntax errors).
   - Node syntax / execution checks: run node against changed backend scripts.
3. **Inspect Output**: If any command fails with errors, parse the stack trace and error message directly.
4. **Self-Heal**: Adjust the code to resolve the failure and re-run the verification step.
5. **Completion**: Only finish once all checks pass cleanly with 0 errors.

## 2. Guardrails for Inventory System
- Ensure data consistency: Never bypass database constraints, transaction rollbacks, or validation checks.
- Prevent infinite loops: If an issue is fundamentally blocked by external configuration (e.g. missing API keys / credentials), report the exact missing credential clearly to the user.

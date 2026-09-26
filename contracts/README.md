# Shared contracts

Some rules are implemented twice: once in the backend (Python) and once in
the frontend (JavaScript). The JSON files in this directory are the single
source of truth for those rules. They are read **only by the test suites**
of both sides, never by application code, so they are not part of the Docker
image nor of the frontend bundle.

| File | Pins | Backend test | Frontend test |
| --- | --- | --- | --- |
| `price-stats-cases.json` | Price statistics formulas (window, average, price change, lowest, at lowest) | `backend/tests/test_price_stats_contract.py` | `frontend/src/lib/productHistory.contract.test.js` |
| `hist-window.json` | Historical window options and default | `backend/tests/test_contracts.py` | `frontend/src/lib/contracts.test.js` |
| `daily-check-report.json` | Telegram daily check report modes and default | `backend/tests/test_contracts.py` | `frontend/src/lib/contracts.test.js` |
| `api-fields.json` | Field names of the product dashboard/detail/history responses | `backend/tests/test_contracts.py` | `frontend/src/lib/contracts.test.js` |

## Changing a shared rule

1. Edit the contract JSON first (add or change the cases/values).
2. Run both test suites (`just test`): the side(s) not yet updated fail.
3. Update the Python and JavaScript implementations until both pass.

Never change an implementation to make its contract test pass without
checking that the other side still agrees with the JSON.

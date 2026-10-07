# DueCase 0.3.0 — stabilization

Baseline: a3a8f92. Authorized by the owner to implement the previously collected fixes. No production data has been modified during local tests.

## Implemented

- Direct Accordi tab; menu and cards adapted to small displays; consistent blue, orange and cream gradients. High-resolution logo and photo splash with native crisp text.
- Shared safe-area modal wrapper, keyboard avoidance, visible settings scrollbar, explicit settings continuation text. Browser verification at 393×852: no page errors, full send button visible. Physical Android/iOS safe-area and keyboard tests remain necessary.
- Registration: create/join family distinction, optional phone, automatic date slashes, blank native date pickers start today, web date controls, minimum eight-character password with uppercase and special character, matching confirmation validated by server.
- Account verification and password recovery tramite email: expiring HMAC codes, five-attempt maximum, resend delay, single use, JWT revocation after reset. Verification enforcement is opt-in until mail delivery is configured.
- Message retry ID prevents duplicates; attachment-only messages; authenticated PDF download; older-message pagination; reduced technical text; input retained on send failure. Production error cause still needs confirmation against Render logs.
- PostgreSQL change notifications wake authenticated family-scoped long polls. Views and counts refresh in the foreground, on reconnect and push receipt, with a fallback refresh at heartbeat. Numeric navigation and launcher badge requests. System push includes unread count. Missing push registration is reported instead of equating notification permission with working delivery.
- Pending agreements/events/exceptions cannot overwrite a prior decision. Agreement/event responses and exception responses commit with their history. Payment declaration locks the expense and checks remaining reimbursement, including pending declarations; confirmation serializes on the same expense. Confirmed transfers reduce balances.
- Migration tracking and a startup advisory lock replace unconditional migration replay. Paid status is preserved during the first tracked migration rollout.
- A shared custody resolver drives current custody, calendar and parenting reports. Daily exceptions have a creation form. Per-child planned days are clearly distinguished from measured time.
- PDF reports include agreements, events, reimbursements and message attachment hashes.
- Account deletion revokes access and removes login/profile data without destroying the other parent's shared expenses/messages/documents. Shared records remain attributed to Account eliminato; this is stated before confirmation.

## Verified locally

`npm test --prefix backend`: nine integration tests pass on disposable PGlite/PostgreSQL WASM: family onboarding, messaging/read counts/isolation/attachments/retries, agreement responses/audit, reimbursement bounds/balances, repeated migrations preserving paid status, custody consistency, email not configured, PDF export, code single use and password reset JWT revocation, account deletion preserving shared history. Several cases are grouped in a test.

Backend/frontend TypeScript checks pass. Expo Doctor: 21/21 checks pass. Android and web JS exports pass. Browser smoke test uses mocked APIs; it is not a physical-phone test or a production push test. PGlite runs transactions serially; load/concurrency behaviour must also be checked on real PostgreSQL before broad release.

## External activation / remaining verification

- Render workspace selection must be confirmed by the owner as required by the connector; available workspace is **My Workspace** (`tea-d9uepih42hec73f7kdp0`). Deployment logs and production schema have not been inspected in this session.
- Email deliberately deferred: set SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, EMAIL_FROM and OTP_SECRET in hosting secrets. Verify real delivery first, then enable EMAIL_VERIFICATION_REQUIRED=true. Without SMTP, API returns EMAIL_NOT_CONFIGURED; no simulated email or signature.
- Android OS push: provide Firebase app configuration through GitHub secret GOOGLE_SERVICES_JSON_BASE64 (workflow decodes it into GOOGLE_SERVICES_FILE) and configure the corresponding Expo/FCM sending credentials. Neither credential presence nor real delivery is verified. Test with two phones, app open/background/closed, denied permissions, reconnect, notifications and badges. Launcher numeric badge display also depends on the launcher.
- iOS push credentials, App Store/Play billing, store accounts and paid family subscription activation are external setup. Premium remains explicitly in test mode. No claim of store readiness.
- Ordinary weekly patterns/weekend settings retain the existing shared-edit behaviour, with history and notification. Approval is required for daily exceptions; a proposal workflow for replacing a whole weekly plan is not included.
- Notification taps navigate to the relevant section; precise highlighting of a specific historical entity is not implemented.
- Live OS delivery cannot be guaranteed instant under offline/battery restrictions. In-app updates do not require reopening the screen.

## Asset provenance

Built-in ImageGen used to refine the existing two-house/heart logo and recreate the low-resolution splash photo without embedded text. Assets: frontend/assets/duecase-logo-hd.png and frontend/assets/splash-background-hd.png. Originals retained. Prompt constraints: same blue-left/orange-right houses and blue heart, transparent background, crisp edges; sunset scene with two children seen from behind on a stone wall, navy/pink hoodies, empty sky for native typography, no baked-in text. No external stock-image downloads.

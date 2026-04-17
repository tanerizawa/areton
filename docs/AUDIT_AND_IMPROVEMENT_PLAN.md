# ARETON.id — Audit Mendalam & Rencana Perbaikan

> **Tanggal audit:** 2026-04-17  
> **Scope:** Monorepo penuh (`apps/api`, `apps/web`, `apps/admin`, `apps/mobile`, `packages/*`, `infra`, `docker`, CI).  
> **Tujuan:** Memotret kondisi aplikasi apa adanya, memetakan bug kritikal, anti-pattern desain/kode, serta merumuskan rencana perbaikan bertahap (Hardening MVP → Refactor → Scale-up) sesuai best practice industri.
>
> Dokumen ini **tidak** mengubah kode produk — hanya rencana. Setiap item diberi **Severity** (🔴 Critical / 🟠 High / 🟡 Medium / 🟢 Low) dan **Effort** (S = sedikit file; M = 1 modul; L = lintas modul; XL = arsitektur).

---

## 0. Ringkasan Eksekutif

ARETON.id adalah platform marketplace "companion services" berskala Indonesia dengan enterprise-grade ambitions: escrow payments multi-gateway (Xendit, DOKU, NOWPayments), eKYC, real-time chat, live GPS tracking/geofencing, SOS, 2FA TOTP, PII encryption, corporate subscriptions, referral, training, blog/CMS, admin panel, dan aplikasi mobile Expo.

**Verdict teknis:** Cakupan fitur sudah sangat luas (product-wise sudah melampaui MVP), tetapi **maturity teknisnya belum selaras dengan ambisinya**. Banyak fondasi rapi (Nest modul, Prisma, Redis, JWT rotation, audit log, Helmet, rate limiting, Swagger) — tetapi terdapat sejumlah bug kritikal di alur uang (race condition booking, transaksi Prisma hilang, webhook signature tidak mandatory), kebocoran kebijakan keamanan (JWT secrets opsional di dev, env contoh di-commit, token di `localStorage`, `cookie` auth tanpa `HttpOnly`/`Secure`), dan anti-pattern front-end (logic auth tersebar di axios interceptor yang tergantung `window.location.pathname`, admin auth pakai `localStorage`, banyak `fetch` langsung tanpa melalui client terpusat).

Rencana perbaikan dibagi 3 gelombang:

1. **Wave 1 — Hardening MVP (wajib sebelum go-live publik):** tutup bug uang & keamanan, normalkan auth, single API client, concurrency guard pada booking & payment.
2. **Wave 2 — Refactor Arsitektural:** pecah "god services" (`admin.service 1109 LoC`, `user.service 874 LoC`, `payment.service 888 LoC`), introduce Repository + Use-case layer, shared DTO package, CQRS lite untuk reads berat.
3. **Wave 3 — Scale & Ops:** observability lengkap (OpenTelemetry), job queue (BullMQ) untuk email/SMS/webhook retry, CDN untuk uploads, DB read-replica & indexing lanjutan, test harness e2e Playwright.

---

## 1. Peta Arsitektur (saat ini)

```
┌────────────────────────────────────────────────────────────────────┐
│                        Turborepo (root)                           │
├──────────────────┬──────────────────┬──────────────────┬──────────┤
│  apps/api        │  apps/web        │  apps/admin       │ apps/   │
│  NestJS 10       │  Next.js 14      │  Next.js 14       │ mobile  │
│  Prisma 5 / PG17 │  App Router      │  App Router       │ Expo 53 │
│  Redis 8         │  Zustand+persist │  fetch+localStorage│ RN 0.79 │
│  Socket.io       │  axios global    │  recharts         │         │
│  ~27 modul       │  SSR + client    │  admin-only       │         │
├──────────────────┴──────────────────┴──────────────────┴──────────┤
│  packages/shared-types (belum dipakai secara konsisten)           │
│  infra/ (nginx, monitoring), docker/ (compose prod+dev)           │
│  .github/workflows/ci.yml (lint + typecheck + test + docker)      │
└────────────────────────────────────────────────────────────────────┘
```

**Modul backend (27):** `auth, user, booking, payment, chat, notification, review, safety, admin, matching, corporate, training, premium, metrics, kyc, image, referral, article, testimonial, gdpr, analytics, invoice, health`.  
**Modul dengan gateway payment:** Xendit, DOKU, NOWPayments (crypto), plus stub Midtrans.  
**Cron jobs aktif:** expire PENDING booking, expire unpaid CONFIRMED, cleanup OTP Redis.  
**Security primitives:** AES-256-GCM (PII), audit log, TOTP HMAC-SHA1 custom, refresh-token blacklist Redis.

---

## 2. Temuan — Backend (NestJS API)

### 2.1 🔴 Critical — Bug Uang & State Transition

1. **Race condition saat create booking.** `apps/api/src/modules/booking/booking.service.ts` (`create()` L50–L142) memeriksa overlap lalu `booking.create()` tanpa transaksi maupun advisory lock. Dua client bisa ambil slot yang sama serempak. **Fix:** bungkus dalam `prisma.$transaction` dengan `SELECT … FOR UPDATE` via raw SQL atau gunakan **PostgreSQL advisory lock** (`pg_advisory_xact_lock(hashtext('escort:' || escortId))`).
2. **`Payment.create`, `Booking.accept`, `cancel`, dan `addTip` tidak dibungkus transaksi.** Jika update booking sukses dan `payment.upsert`/`refundClaim.create` gagal, state divergen. **Fix:** `prisma.$transaction([...])` di seluruh state transition yang menyentuh >1 tabel. Saat ini `$transaction` hanya dipakai 2× di seluruh API (`gdpr`, `refund-claim`).
3. **Webhook tanpa signature = auto-accept di dev.** `payment.service.ts handleWebhook` L474, `handleCryptoWebhook` L561, `handleDokuWebhook` L650 hanya memverifikasi signature "jika `callbackToken`/signature dikirim dan gateway configured". Penyerang tinggal POST ke `/payments/webhook` tanpa header saat mode mock/dev → bisa mengubah status jadi ESCROW. Risiko besar kalau env prod lupa set `XENDIT_WEBHOOK_TOKEN`/`NOWPAYMENTS_IPN_SECRET`/`DOKU_SECRET_KEY`. **Fix:** Policy strict — tolak semua webhook tanpa signature valid **kecuali `NODE_ENV!=='production'` dan whitelist IP**. Tambahkan table `webhook_events` (dedup via `event_id`) untuk idempotency.
4. **Kalkulasi `platformFee`/`escortPayout` memakai `toNumber()` → `Decimal(…)`.** Ada risiko floating-point untuk order besar. Gunakan `Decimal.mul/sub` langsung (Prisma Decimal) tanpa bolak-balik `Number`. Contoh drift: L358–L359, L651–L652 booking; L65–L66, L357 payment.
5. **`addTip` di-klaim idempotent, tapi diukur dari `tipAmount > 0`** (booking L662). `payment.update` untuk `escortPayout` menimpa tanpa lock → race ganda dari double-click client. **Fix:** transaksi + `where: { id, tipAmount: null }` sebagai optimistic guard.
6. **`reschedule` reset status ke `PENDING` tetapi tidak membatalkan payment yang sudah `ESCROW`.** Jika booking sudah CONFIRMED & dibayar, lalu client reschedule → status turun ke PENDING tetapi `payment.status` tetap ESCROW, dan kolom lama `paymentType` dipertahankan. **Fix:** reject reschedule jika `payment.status === 'ESCROW'`, atau batalkan+refund otomatis lalu minta bayar ulang.
7. **`processRefund` menampung error Xendit dan tetap update DB ke `REFUNDED`** (payment L848–L862). Kata lain: admin klik refund, Xendit gagal, DB tetap bilang refunded → uang tidak kembali ke user. **Fix:** jangan melanjutkan `payment.update` jika gateway gagal; angkat error & retry via queue.
8. **`cancel()` (booking L402–L499) sort tier fee salah.** Loop `for (tier of sortedFees)` hanya meng-set `feePercent = tier.feePercent` **tanpa `break`**, jadi tier paling rendah (48 jam = 0%) jika `hoursUntilStart < 48` akan di-overwrite berulang kali oleh tier <24, <12, <6 → akhirnya tertulis tier terakhir yang cocok (mungkin benar), **tetapi bila user cancel 50 jam di depan, kondisi `hoursUntilStart < 48` false, feePercent tetap 0, ini benar — namun logika sangat rapuh dan tergantung urutan**. Tulis ulang dengan pencarian tier eksplisit dan unit test.

### 2.2 🔴 Critical — Keamanan

1. **JWT secrets tidak wajib di development.** `app.module.ts` L54–L55 — `JWT_ACCESS_SECRET/REFRESH_SECRET` hanya required saat `NODE_ENV=production`. Di dev, `auth.service.generateTokens` → `config.get('jwt.accessSecret')` → **undefined** → `@nestjs/jwt` mungkin melempar runtime error atau (lebih buruk) sign tanpa secret kuat. **Fix:** always required + minimum length (≥32 chars) validasi Joi.
2. **File `.env` riil ter-commit di repo** (tree `/workspace/.env` — 3109 bytes). `.gitignore` memang memuat `.env` tetapi file sudah masuk history commit awal. **Fix:** `git rm --cached .env` + rotasi seluruh credential yang pernah ada di situ + verifikasi via `git log -p .env`.
3. **Admin panel menyimpan JWT di `localStorage`** (`apps/admin/src/app/page.tsx` L51–L53, `lib/api.ts` L3–L7). Rentan XSS → pencurian token admin. **Fix:** pindahkan ke `HttpOnly` + `Secure` cookie; token refresh via endpoint khusus. Idem untuk web app (`auth.store.ts` L57–L58).
4. **Cookie `areton_auth=1`** dipakai middleware sebagai satu-satunya penanda auth (`apps/web/src/middleware.ts`). Cookie ini `SameSite=Lax` tanpa `Secure`, dan **tidak bersignature** — tinggal bikin manual di browser untuk bypass middleware (walau AuthGuard client-side masih ada). **Fix:** gunakan session signed / middleware validasi JWT (tidak perlu DB, cukup verify signature) via `jose`.
5. **Password reset token disimpan sebagai key `pwd_reset:<token>` di Redis dengan `email` plaintext di value.** Bila Redis snapshot bocor, token + email terkorelasi. Minor, tapi lebih aman pakai `hash(token)` sebagai key.
6. **TOTP custom (base32 + HMAC-SHA1 manual).** Sudah benar secara matematis tetapi tidak constant-time comparison di `verifyTOTP`. Potensi timing attack (kecil). Ganti dengan `otplib` / `speakeasy` atau `crypto.timingSafeEqual`.
7. **Refresh token disimpan utuh di Redis blacklist** (L213). Token refresh berukuran besar → banyak memory. Lebih baik simpan `jti` / hash-nya.
8. **Reset password flow: `forgotPassword()` melempar `NotFoundException` jika email tak terdaftar** (L233). Ini **user enumeration vulnerability** — atacker bisa bedakan email terdaftar vs tidak. **Fix:** always return generic success.
9. **Encryption default key hard-coded fallback** (`encryption.service.ts` L12: `'areton-default-encryption-key-change-me!'`). Jika env lupa di-set, enkripsi PII memakai key terkenal. **Fix:** gagal start app bila `ENCRYPTION_KEY` kurang dari 32 byte.
10. **Chat WebSocket CORS di-hardcode** (`chat.gateway.ts` L25–L31) dan JWT verify langsung, tapi **tidak merevoke koneksi saat refresh token di-blacklist**. Peer bisa tetap connect dengan access-token yang masih valid. Minor tapi perlu `disconnect-on-user-ban`.
11. **`.env` nyata (file saat ini) masih memakai secret dummy** ("change-in-production"). Audit lingkungan produksi untuk memastikan rotasi.
12. **HelmetCSP disabled** (`main.ts` L19). Untuk API-only memang defensible, tetapi tetap aktifkan minimum CSP untuk endpoint Swagger di dev dan kunci endpoint uploads statis.
13. **Uploads served langsung oleh Nest** via `ServeStaticModule` dari `process.cwd()/uploads`. Tidak ada validasi ekstensi/MIME pada URL: jika filename berbahaya masuk ke disk, akan disajikan. Gunakan CDN/presigned URL + `Content-Disposition: attachment`.

### 2.3 🟠 High — Desain & Anti-Pattern

1. **"God services" melewati 800–1100 LoC:** `admin.service` 1109, `payment.service` 888, `user.service` 874, `booking.service` 805. Menyulitkan test, review, dan ownership. **Fix (Wave 2):** pecah per use-case (`booking.create.usecase.ts`, `booking.cancel.usecase.ts`, …) atau minimal per fitur (BookingStateMachineService, BookingAvailabilityService).
2. **Tidak ada layer Repository.** `PrismaService` dipakai langsung di service, termasuk query kompleks. Menyulitkan unit test & swap ORM. **Fix:** Repository Pattern untuk entitas utama + interface untuk DI di test.
3. **DTO tidak di-share ke frontend.** Package `shared-types` ada, tapi cek cepat menunjukkan konsumsi minim — FE banyak re-deklarasi interface (mis. `auth.store.ts` User). **Fix:** generate types dari Prisma + Zod schema sebagai source of truth di `packages/shared-types`.
4. **`ValidationPipe` memakai `enableImplicitConversion: true`** — sering menyembunyikan bug tipe saat number datang sebagai string dari query. Combine dengan `transform: true` sudah dilakukan, tetapi transform ke DTO juga butuh `@Type(() => Number)`. Audit DTO query (mis. `BookingQueryDto`, `PaymentQueryDto`) untuk pastikan `@Type`.
5. **Interceptor `TransformInterceptor` membungkus `data` tetapi beberapa endpoint (webhook, file serve) butuh bentuk raw.** Sudah ada `@Public()` untuk bypass auth, tapi **tidak ada bypass transform** → webhook respond `{ success, data }`, padahal gateway kadang butuh `OK` plain text. Audit tiap gateway's expected response.
6. **Rate limiter `@nestjs/throttler` dipasang global** tapi endpoint auth penting (`login`, `register`, `forgot-password`, `verifyEmail`, `sendOTP`) tidak pakai `@Throttle` custom yang lebih ketat. Brute-force email/password masih mungkin 100/min. **Fix:** `@Throttle({ short: { limit: 5, ttl: 60000 } })` pada `POST /auth/login`, `/auth/forgot-password`, `/auth/otp/send`.
7. **Banyak `.catch(() => {})`** untuk notifikasi — error ditelan diam-diam. Tambahkan logging + outbox pattern agar notifikasi tidak hilang saat gangguan provider.
8. **Cron berjalan di semua instance.** `@Cron` di dalam `BookingService` akan trigger di setiap replica → duplicate cancellation. **Fix:** pakai `@nestjs/schedule` + Redis `SETNX` lock, atau pindahkan ke worker terpisah.
9. **Decimal ↔ Number casting** di perhitungan earning, hourlyRate × durationHours (booking L118) memakai `Number` — potensi pembulatan salah untuk tarif > IDR 1 milyar/jam. Gunakan `Prisma.Decimal(hourlyRate).mul(durationHours)`.
10. **Swagger otomatis nonaktif di production** — bagus, tetapi tidak ada export schema untuk konsumsi FE/mobile. Generate OpenAPI JSON di CI untuk diimport ke `packages/shared-types`.
11. **`prisma` log level `query` di dev** bisa membocorkan PII ke stdout container. Redact atau turunkan ke `info`.
12. **Hardcoded URL `https://api.areton.id`** di `user.service.ts` L19 sebagai fallback — bahaya kalau `app.apiUrl` belum diset di staging (semua preview URL jadi rusak).

### 2.4 🟡 Medium — Operability, Observability, Testing

1. **Jest hanya 2 file (`booking.service.spec.ts`, `payment.service.spec.ts`).** Tidak ada e2e test coverage berarti. CI memang menjalankan `npm run test`, tetapi matrix module sangat tipis. **Fix:** target ≥60% coverage service + integration tests webhook.
2. **Tidak ada typecheck stage di package individual** (walau CI memanggil `turbo type-check`, tetapi `package.json` tidak mendefinisikan task `type-check`). Audit: `apps/*/package.json` tak punya script `type-check`. CI akan jalan tapi kosong.
3. **`prom-client` terpasang, ada `MetricsInterceptor`** — bagus. Tetapi tidak ada histogram per-route/gateway, tidak ada business metric (`bookings_created_total`, `payments_failed_total`). Tambahkan.
4. **Tidak ada request-id / correlation-id middleware.** Sulit trace request lintas service. Tambahkan `LoggingInterceptor` yang inject `x-request-id`.
5. **Tidak ada queue untuk email, SMS, webhook retry.** Semua `fire & forget` via `.catch()`. Downtime provider = email hilang. Tambahkan BullMQ + Redis.
6. **Sentry opsional via `try { require }`** (filter L5–L10). Lebih baik pakai `@sentry/nestjs` proper init.

---

## 3. Temuan — Database / Prisma

### 3.1 🟠 High

1. **Tidak ada index composite untuk query hot:** 
   - `Booking` sering di-query `where: { escortId, status IN (...) }` — butuh `@@index([escortId, status])`.
   - `Booking` overlap check `(escortId, startTime, endTime)` — butuh ekspresi index atau GiST range. Minimal `@@index([escortId, startTime])`.
   - `Payment` `where: { booking: { escortId } }` ikut join → cepat, tapi sering juga `where: { bookingId }` (unique, OK). Tambahkan `@@index([status, createdAt])`.
2. **Model `AuditLog` tanpa partitioning plan.** Akan membengkak cepat. Rencanakan monthly partition atau TTL (archive → cold storage S3).
3. **`ChatMessage.content` diklaim encrypted tetapi service sebenarnya menulis plaintext** (`chat.service.ts` L142: `TODO: Encrypt message content before storing`). Di sisi lain, `booking.service.findActive` memanggil `decryptSafe` → mengikuti try/catch. Artinya chat saat ini tidak benar-benar terenkripsi. **Fix:** implement enkripsi pesan menggunakan `EncryptionService` di `chat.service.sendMessage`.
4. **`PromoCode` tidak di-enforce lewat relation ke `Booking`** → tidak ada audit pemakaian per booking. Tambahkan `PromoRedemption` table (bookingId, promoId, discount).
5. **`Withdrawal.bankAccount` plaintext.** PII finansial wajib di-encrypt (AES-GCM seperti KTP).
6. **Enum `BookingStatus` tidak punya state `EXPIRED`** — cron sekarang set `CANCELLED` dengan alasan auto-expire. Konsumen analytics sulit bedakan user-cancel vs system-expire. Tambah `EXPIRED` enum + migrasi.
7. **Tidak ada soft-delete.** User/booking yang dihapus akan cascade hilang total — tidak bagus untuk finance/audit. Gunakan `deletedAt`.
8. **`EscortProfile` menyimpan puluhan field string deskriptif** (`age, height, weight, bodyType, hairStyle, …`) tanpa ENUM/lookup table — sulit filtering & i18n. **Fix:** normalisasi ke lookup table (`TagCategory`, `Tag`) atau enum untuk field dengan nilai terbatas.
9. **Field `ratingAvg: Float` di-update manual**. Rentan drift vs `Review.rating` real. Tambah trigger atau recompute cron.
10. **Referral punya unique `referredId`** — benar. Tapi tidak ada constraint `referrerId != referredId` di DB — hanya di service. Tambah CHECK constraint.

### 3.2 🟡 Medium

1. Migrasi tidak punya seed canonical (`prisma/seed.ts` dipanggil tapi file seeder besar tersebar `seed-angel-lidya.js`, `seed-demo-*.js`, `seed-users.ts` di root `apps/api/` — tidak rapi).
2. `jsonb` di `AuditLog.details`, `IncidentReport.evidence`, `KycVerification.providerResponse` tanpa jsonb-index. Query analitik akan lambat di >1M rows.

---

## 4. Temuan — Frontend Web (Next.js 14)

### 4.1 🔴 Critical

1. **Axios interceptor tergantung `window.location.pathname`** untuk memutuskan kapan attach Bearer token (`apps/web/src/lib/api.ts` L12–L28). Artinya:
   - Panggilan API dari komponen shared (mis. `/user/bookings` → `Header` di root yang belum di `/user/*`) tidak mengirim token.
   - Route baru di luar `/user/` atau `/escort/` (mis. `/admin`, `/corporate`) otomatis anonim.
   - Rentan race: navigasi saat request in-flight → token tak konsisten.
   **Fix:** selalu attach Authorization jika ada token; gunakan 401 response untuk invalidate. Simpan token in-memory + refresh cookie.
2. **Token JWT di `localStorage`** (`auth.store.ts`, `lib/api.ts`). Rentan XSS. Wajib pindah ke HttpOnly cookie.
3. **Campuran pola fetch:** ada `axios.api`, ada `fetch(`${process.env.NEXT_PUBLIC_API_URL}/…`)` tersebar (sos-button, tip-modal, incidents admin, sitemap, testimonials, blog). 7+ jalur berbeda, tidak konsisten dalam handling refresh-token, error shape, error logging. **Fix:** satu `api` client, SSR-aware wrapper.
4. **`next.config.js` fallback `https://api.areton.id/api`** sebagai NEXT_PUBLIC_API_URL. Ini di-bake ke bundle production — jika env lupa, semua PR preview menembak prod. Potensial menembak endpoint prod dari staging/preview. Hapus default prod URL di fallback; gagal build saat tidak diset.
5. **Middleware hanya mengecek ada/tidaknya cookie `areton_auth`**, tidak memvalidasi JWT. Kombinasi dengan bug #1 → user bisa melihat shell `/user/dashboard` walau token expired, lalu baru dipaksa logout.

### 4.2 🟠 High — UX/UI & Aksesibilitas

1. **Banyak SVG inline duplikatif** di `login/page.tsx` (email icon, lock icon). Sentralisasikan di `components/ui/icon.tsx` atau pakai `lucide-react` (sudah dependency). Bundle size turun.
2. **A11y lemah:** input tanpa `aria-*` untuk error, `div role="alert"` hilang, focus management pada Wizard step tidak ter-manage. Tes dengan axe-core.
3. **i18n inconsistent:** `useI18n()` ada, tapi banyak string literal Bahasa Indonesia hard-coded di halaman (dashboard, booking). Aktifkan ESLint rule untuk string literal di JSX.
4. **Dark theme** hardcoded (`bg-dark-900`). Tidak ada toggle `prefers-color-scheme`. Bukan MVP-blocker.
5. **`WelcomeTour` di dashboard** — render otomatis tiap kali komponen mount; tidak mengecek kondisi `firstVisit` via SSR → risiko flash/flicker dan re-render berulang.
6. **Image optimization:** banyak `<img src="https://images.unsplash.com/...">` (dashboard) — pakai `next/image` + `remotePatterns` di `next.config.js`.
7. **Button/Input komponen lokal** — tapi tidak ada design tokens dokumentasi → gaya tumbuh liar antar page. Integrasikan Storybook (bukan wajib MVP).

### 4.3 🟡 Medium — Bug Fungsional & Performance

1. **`useEffect` tanpa cleanup** di `dashboard/page.tsx` — fetch masih in-flight saat unmount → `setState on unmounted`. Tambah `AbortController`.
2. Banyak `useEffect(loadX, [])` dengan eslint-disable implicit — audit dependensi; terutama untuk halaman chat & bookings dengan pagination.
3. **Socket.IO** membuat koneksi global via `PresenceProvider` → tidak memutus jelas saat logout. Potensi ghost presence.
4. **Zustand persist** hanya menyimpan `user, isAuthenticated` — baik, tetapi saat `fetchProfile` gagal, memutus state tapi tidak memutus socket.

### 4.4 🟢 Low

1. `next-env.d.ts` tidak di-ignore (otomatis regen).
2. Tidak ada `robots.ts` preview gating — auto `index: true` bisa mempindeksi preview URL. Gate via env `NODE_ENV`/`VERCEL_ENV`.

---

## 5. Temuan — Admin Panel

### 5.1 🔴 Critical

1. **Login admin via `fetch` manual** (`admin/src/app/page.tsx` L27–L54). Tidak memakai client terpusat, tidak ada rotasi refresh jika login expired di halaman yang sama.
2. **Otorisasi role hanya di client** (`isAuthed` memanggil `/admin/stats` lalu set `isAuthed=true`). Di `admin-layout.tsx` L32–L38 **fallback "offline mode" tetap mengizinkan akses UI**. Artinya jika API mati atau throttling → layout tetap render isi admin tanpa memvalidasi token. Hapus fallback ini.
3. **Admin token di `localStorage`** — sama seperti web. Risiko XSS.
4. **`NEXT_PUBLIC_API_URL` default `http://localhost:4000` tanpa `/api` suffix** di admin — sementara web memakai `/api` suffix. Inkonsistensi → admin panel di prod akan memanggil `https://api.areton.id/auth/login` (404) jika env tidak di-set persis.
5. **Tidak ada CSRF protection** walaupun cookie-based auth belum dipakai — tetap rencanakan saat migrasi ke HttpOnly cookie.

### 5.2 🟠 High

1. Nav menu admin tidak mengecek permission granular per-role (`ADMIN` vs `SUPER_ADMIN`). Fitur super-sensitif (rotasi commission rate, audit-logs) harus gated.
2. Tidak ada `admin-layout` error boundary — error tampilan buat seluruh page crash.

---

## 6. Temuan — Mobile (Expo RN)

Cepat (tidak membuka semua screen):

1. **Duplikasi modul navigasi** (bottom-tabs + native-stack) — OK arsitektur, tetapi `axios` tanpa interceptor refresh (asumsi: perlu diaudit di `apps/mobile/src/lib`).
2. `.env` mobile: Expo memakai `EXPO_PUBLIC_*` / `app.json.extra` — cross-check nilai konsisten dengan web.
3. **Deep links** untuk OAuth Apple/Google harus di-whitelist via `app.json`. Audit.
4. `react-native 0.79.6` + `expo 53` relatif baru — stabil tapi pastikan peer-dep `react 19.0.0` (ter-declare di root) tidak bentrok dengan `react ^18.3.0` di `apps/web`. Versi ganda React di tree monorepo bisa menyebabkan "Invalid hook call".

> **Catatan:** Root `package.json` punya `"react": "19.0.0"` dan `"react-dom": "^19.0.0"`, sementara `apps/web` meminta `"react": "^18.3.0"`. Ini konflik berbahaya. `npm install` akan menyelesaikannya via workspace hoisting, tetapi sangat rapuh. **Fix:** standarkan versi React (pilih 18 untuk Next 14 atau 19 jika migrasi Next 15) lintas monorepo.

---

## 7. Temuan — Infra, CI, Env

1. **`.env` ter-commit.** Prioritas 1 saat Wave 1. Rotasi semua secret & purge dari git history (BFG/git-filter-repo).
2. **CI tidak memblokir merge pada coverage<threshold.** Tambah coverage gate + Codecov.
3. **CI tidak menjalankan `prisma migrate diff`** untuk mendeteksi schema drift.
4. **Docker image API pakai `node:20-alpine`** — baik. Pastikan multi-stage + non-root user.
5. **`docker-compose.yml` dev mengekspos `pgAdmin`** — pastikan disable di prod.
6. **Tidak ada health-check granular.** `HealthModule` ada, tetapi tidak dipakai di compose `healthcheck` section.
7. **File `test-crypto-payment.sh`, `test-phase16.sh`** di root repo — pindahkan ke `scripts/` atau hapus jika obsolete.
8. **Seed scripts liar** (`seed-*.js` + `.ts`) di root `apps/api/` bukan di `apps/api/prisma/seeds/`. Konsolidasikan.
9. **`ecosystem.config.js` (PM2)** dan `docker-compose.production.yml` koeksis — pilih satu strategi deploy.
10. **Nginx config `infra/cloudflare-nginx.conf`** tidak di-versi dengan env overrides — susah reproduce.

---

## 8. Bug Desain (UI/UX) yang Perlu Ditindaklanjuti

Dari pengamatan halaman kunci:

1. **Dashboard client** (`/user/dashboard`): tidak ada skeleton state (hanya spinner di "Booking Terbaru"); stat cards langsung tampilkan `—` → kesan "kosong" sebelum load. Tambahkan skeleton.
2. **Login multi-step (Wizard)**: kalau user salah email dan lanjut ke step 2, tekan back → state password tidak di-reset. Kecil tapi membingungkan.
3. **Error banner** memakai warna merah tanpa ikon ♿. Tambah ikon AlertCircle.
4. **Admin login**: tombol submit tidak loading saat jaringan lambat >1s (walaupun label ganti "Signing in…", tombol tetap bisa di-klik dua kali pada race antara `setLoading` dan form re-submit karena tidak ada `form.noValidate`).
5. **Mobile-first**: banyak layout dashboard pakai `sm:grid-cols-2 lg:grid-cols-4` — baik, tetapi padding horisontal di `<640px` terlalu rapat untuk thumb-reach. Audit safe-area.
6. **Typography**: 3 font display (Inter, Playfair, Cormorant) dimuat bersamaan → +~100KB font. Pilih 2 maksimum.
7. **Tidak ada `<meta viewport-fit=cover>` untuk notch**.
8. **Empty states generik** ("Belum ada booking.") — tambah ilustrasi + CTA yang lebih menjual.
9. **Chat UI** (tidak di-audit mendalam) — pastikan mark:read event di-throttle.

---

## 9. Rencana Perbaikan — Roadmap

Urutan berdasar risiko & ketergantungan. **Effort** relatif: S<M<L<XL.

### Wave 1 — Hardening MVP (Go-live Blocker)

| # | Kategori | Item | Sev | Effort |
|---|---|---|---|---|
| 1.1 | Security | Rotasi semua secret; `git rm --cached .env`; audit history | 🔴 | S |
| 1.2 | Security | Wajibkan `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY` (min 32 chars) di **semua** env, termasuk dev | 🔴 | S |
| 1.3 | Payment | Implement **strict webhook signature verification** (tolak tanpa signature di prod) + tabel `webhook_events` untuk idempotency | 🔴 | M |
| 1.4 | Payment | Bungkus `accept`, `cancel`, `create payment`, `release`, `refund`, `addTip`, `reschedule` dalam `prisma.$transaction` | 🔴 | M |
| 1.5 | Payment | `processRefund` tidak boleh update DB bila gateway gagal — kirim ke retry queue | 🔴 | S |
| 1.6 | Booking | Race-free booking create via PG advisory lock atau `$transaction + SELECT FOR UPDATE` | 🔴 | M |
| 1.7 | Auth | `forgotPassword` return generic success untuk mencegah user enumeration | 🔴 | S |
| 1.8 | Auth | Pindah token ke **HttpOnly Secure cookie** (web + admin) + endpoint `/auth/refresh` via cookie | 🔴 | L |
| 1.9 | Auth | Hapus "offline fallback" di `admin-layout` yang meng-authorize saat API error | 🔴 | S |
| 1.10 | API client | Hapus logic "attach token hanya di `/user/*` atau `/escort/*`"; selalu kirim token bila ada; 401 → refresh sekali | 🔴 | S |
| 1.11 | Chat | Implement enkripsi pesan (panggil `EncryptionService.encrypt`) di `chat.service.sendMessage` dan decrypt di read | 🔴 | S |
| 1.12 | Auth | Throttle ketat: `login=5/min`, `register=3/min`, `forgot=3/hour`, `otp/send=3/hour` per IP+email | 🟠 | S |
| 1.13 | DB | Migrasi enkripsi `Withdrawal.bankAccount` (encrypt-at-rest) | 🟠 | S |
| 1.14 | DB | Tambah index composite: `Booking(escortId, status, startTime)`, `Payment(status, createdAt)` | 🟠 | S |
| 1.15 | Observability | Correlation-id middleware + structured JSON logging + Sentry init proper | 🟠 | M |

**Keluaran Wave 1:** Aplikasi siap rilis terbatas, tidak ada risiko kehilangan uang / pencurian kredensial.

### Wave 2 — Refactor Arsitektural

| # | Item | Effort |
|---|---|---|
| 2.1 | Pecah `AdminService` (1109 LoC) → sub-modules: `FinanceAdminService`, `UserAdminService`, `EscortVerificationService`, dst. | L |
| 2.2 | Pecah `PaymentService` per flow: `PaymentInitService`, `WebhookService`, `PayoutService`, `RefundService` | L |
| 2.3 | Pecah `BookingService` → `BookingCommandService`, `BookingQueryService`, `BookingStateMachine`, `BookingCronService` | L |
| 2.4 | Introduce Repository Pattern (minimal per aggregate root) — prep untuk unit test tanpa DB | L |
| 2.5 | Share DTO & Types: Zod schema di `packages/shared-types`, consume di web/admin/mobile; generate OpenAPI JSON di build time | L |
| 2.6 | Replace ad-hoc `fetch` di web/admin dengan 1 client (+ SSR wrapper `server-api.ts`) | M |
| 2.7 | Soft-delete (`deletedAt`) di `User`, `Booking`, `Payment`, `Review`, `Article` | M |
| 2.8 | Promo redemption table + audit pemakaian per booking | S |
| 2.9 | Standardisasi versi React di monorepo (18.x atau 19.x — konsisten) | M |
| 2.10 | Cron lock (Redis SETNX) atau pindahkan cron ke worker service (`apps/api-worker`) | M |
| 2.11 | Rewrite TOTP pakai `otplib` + constant-time compare | S |
| 2.12 | Middleware Next.js validasi JWT signature (tanpa DB) — bukan hanya cek cookie existence | S |

**Keluaran Wave 2:** Kode maintainable, setiap service ≤300 LoC, test coverage ≥60%, satu kontrak API (OpenAPI) dipakai semua client.

### Wave 3 — Scale & Ops

| # | Item | Effort |
|---|---|---|
| 3.1 | Job Queue (BullMQ) untuk email, SMS, push, webhook-retry, escort payout | L |
| 3.2 | OpenTelemetry (traces) → Jaeger/Tempo; Prometheus metric bisnis | L |
| 3.3 | CDN (Cloudflare R2/S3) + presigned upload; hapus ServeStatic dari Nest | M |
| 3.4 | Read-replica PG untuk admin analytics + matching | L |
| 3.5 | e2e testing Playwright (web + admin) + Detox/Maestro (mobile) | L |
| 3.6 | Design system docs (Storybook) + visual regression (Chromatic) | M |
| 3.7 | Partition `AuditLog` per bulan; archive job ke S3 glacier | M |
| 3.8 | Chaos testing (toxiproxy) untuk webhook & Redis outage | M |
| 3.9 | i18n lengkap (ID, EN) + auto-detect via `Accept-Language` | M |
| 3.10 | DB backup + PITR rutin + drill restore | M |

---

## 10. Ringkasan Prioritas (Top-10 segera)

1. 🔴 Purge `.env` dari git + rotasi seluruh secret.
2. 🔴 Wajibkan JWT secrets + encryption key di env validation (Joi).
3. 🔴 Webhook signature strict di prod + table idempotency.
4. 🔴 Semua mutasi multi-tabel dibungkus `$transaction`.
5. 🔴 PG advisory lock untuk create/reschedule booking.
6. 🔴 Token auth → HttpOnly cookie; hapus `localStorage` JWT (web & admin).
7. 🔴 Interceptor axios: selalu attach token, hapus pengecekan pathname.
8. 🔴 Enkripsi pesan chat (saat ini masih plaintext meski schema mengklaim encrypted).
9. 🔴 `forgotPassword` → generic success (anti-enumeration).
10. 🟠 Throttle ketat endpoint auth; seeder & file test di root dibersihkan.

---

## 11. Cara Memakai Dokumen Ini

- Semua item di atas sudah cukup spesifik untuk dibuatkan issue GitHub satu per satu.
- Sarankan labeling: `sev:critical`, `sev:high`, `area:backend|frontend|db|infra|security`, `wave:1|2|3`.
- Gunakan Wave 1 sebagai definition-of-done untuk "MVP yang aman di-rilis publik".
- Audit ini **belum menjalankan test runtime**; hanya static review. Sebelum implementasi perbaikan, lakukan pass e2e smoke (`scripts/smoke-test.sh`, `scripts/uat-test.sh`) untuk dokumentasi baseline.

---

*— Disusun oleh Cursor Cloud Agent, berdasarkan pembacaan menyeluruh atas `apps/api`, `apps/web`, `apps/admin`, `apps/mobile`, `prisma/schema.prisma`, `docker-compose*.yml`, `ecosystem.config.js`, dan `.github/workflows/ci.yml`.*

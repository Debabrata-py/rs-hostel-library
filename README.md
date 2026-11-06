# RS Hostel Library Management System

A web-based library management system developed for the RS Hostel Library, Indian Statistical Institute.

The application provides a public book catalogue, member registration and authentication, librarian administration, borrowing requests, book circulation and member account management.

## 1. Project objectives

The system is designed to provide:

- A publicly accessible library catalogue.
- Book search, category filtering and sorting.
- Book details, cover images and physical shelf locations.
- Member registration, email verification and librarian approval.
- Member accounts and borrowing history.
- Librarian management of books, physical copies and members.
- Borrowing requests, approval, issuing and returning.
- Password recovery.
- Book reviews.
- Email notifications and automatic overdue reminders (planned).

## 2. Technology stack

| Component | Technology |
|---|---|
| Frontend | Next.js 16 |
| UI | React 19 |
| Language | TypeScript |
| Styling | Tailwind CSS 4 |
| Backend | Next.js API Routes |
| Database | PostgreSQL |
| ORM | Prisma 7 |
| Database adapter | Prisma PostgreSQL adapter |
| Authentication | Database-backed sessions |
| Password hashing | Argon2id |
| Package manager | npm |

**Deployment objective:** The final application will run on the institute's own server, using self-hosted PostgreSQL and locally managed file storage. The application must not depend on Supabase or paid hosting platforms.

**Current architecture:** The application uses PostgreSQL through Prisma and the Prisma PostgreSQL adapter. Book-cover uploads are handled by the application's own API and image-processing pipeline; the Supabase client and SDK have been removed. The development copy stores uploaded covers under `public/uploads/book-covers`. Before production deployment, this storage location must be moved to a persistent, separately backed-up directory outside the application release directory.

## 3. Project structure

```text
rs-hostel-library/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   ├── catalogue/
│   │   ├── librarian/
│   │   └── member/
│   ├── librarian/
│   ├── member/
│   ├── login/
│   ├── register/
│   ├── verify-email/
│   ├── forgot-password/
│   ├── reset-password/
│   ├── page.tsx
│   └── globals.css
├── lib/
│   ├── auth.ts
│   ├── prisma.ts
│   ├── csrf.ts
│   └── request-body.ts
├── prisma/
│   ├── migrations/
│   └── schema.prisma
├── public/
├── scripts/
├── .env
├── .gitignore
├── package.json
├── prisma7.config.ts
└── README.md
```

## 4. Development environment

The project is developed on Ubuntu Linux.

Required software:

- Node.js 24 LTS or a compatible supported release
- npm
- PostgreSQL
- Git
- Visual Studio Code (recommended)

Check installed versions:

```bash
node --version
npm --version
psql --version
git --version
```

## 5. Setting up the project

Clone the private repository:

```bash
git clone https://github.com/Debabrata-py/rs-hostel-library.git
cd rs-hostel-library
```

Install dependencies:

```bash
npm install
```

Create a local `.env` file in the project root.

Configure the PostgreSQL connection using:

```env
DATABASE_URL="postgresql://USERNAME:PASSWORD@127.0.0.1:5432/rs_hostel_library"
```

Replace the username and password with the credentials configured on your PostgreSQL installation.

**Security:** Never commit `.env` or share its contents. Environment-specific credentials must remain outside version control.

## 6. Database setup and migrations

The database schema is maintained in:

```text
prisma/schema.prisma
```

Migration history is maintained in:

```text
prisma/migrations/
```

Apply existing migrations to the development database:

```bash
npx prisma migrate dev
```

Generate the Prisma Client:

```bash
npx prisma generate
```

Validate the schema:

```bash
npx prisma validate
```

Format the schema:

```bash
npx prisma format
```

To inspect the database during development:

```bash
npx prisma studio
```

**Important:** Commit new migration files to Git. Do not manually modify an already-applied migration. Production migrations will be handled separately using an appropriate deployment procedure.

## 7. Running the application

Start the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

The development server supports automatic refresh when application files are modified.

## 8. Available npm commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Create production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

Additional Prisma commands are available through `npx prisma`.

## 9. Authentication and member management

The application includes:

- Member registration.
- Email verification tokens with expiry and single-use validation.
- Librarian approval and rejection.
- Active and suspended member states.
- Argon2id password hashing.
- Database-backed login sessions.
- Logout and session revocation.
- Password reset tokens with expiry and single-use validation.
- Session revocation following password reset.
- Rate limits for authentication and account-recovery endpoints.

Email verification and password-reset links currently use development logging. Actual SMTP delivery still needs to be configured; production email-dependent flows must not be treated as operational until that is in place.

## 10. Librarian functionality

Librarians can manage:

- Book catalogue entries.
- Physical book copies.
- Accession numbers and shelf locations.
- Copy condition and availability.
- Member approval and suspension.
- Borrowing requests.
- Book issuing and returning.

Librarians can also borrow books themselves, subject to the circulation rules.

## 11. Reviews, uploads and application protections

The application supports member book reviews, including ratings and review eligibility checks. Book-cover uploads are validated and decoded before processing; accepted images are normalized to WebP and resized before being saved.

The API also applies request-size limits, same-origin checks on state-changing routes, and role-based authorization. Authentication-related endpoints use database-backed rate limiting. These controls reduce risk but do not constitute a guarantee that the application is secure; the production environment still requires a separate configuration and security review.

## 12. Git and GitHub workflow

The source code is maintained in a private GitHub repository:

https://github.com/Debabrata-py/rs-hostel-library

The primary branch is:

```text
main
```

After completing and testing a meaningful development task:

```bash
git status
git add .
git diff --cached --check
git commit -m "Describe the changes"
git push
```

Only stage reviewed project files. Never commit secrets, database dumps, private member information or uploaded user data.

## 13. Source-code backup

Create a Git bundle containing the committed repository history:

```bash
git bundle create ~/rs-hostel-library-backups/rs-library-backup-YYYYMMDD.bundle --all
```

Replace `YYYYMMDD` with the backup date.

Verify the bundle:

```bash
git bundle verify ~/rs-hostel-library-backups/rs-library-backup-YYYYMMDD.bundle
```

Keep independent copies on external storage. A Git bundle does not contain the PostgreSQL database, environment variables or uploaded files.

## 14. Database backup and recovery

PostgreSQL backups must be maintained separately from Git.

Example database backup:

```bash
pg_dump -h 127.0.0.1 -U rs_library_app -d rs_hostel_library -Fc -f rs-library-db.dump
```

Example restoration into an already-created, empty database:

```bash
pg_restore -h 127.0.0.1 -U rs_library_app -d rs_hostel_library --no-owner rs-library-db.dump
```

Use the appropriate database credentials and verify restoration before relying on a backup.

Uploaded files must also be backed up separately once local file storage is implemented.

## 15. Production deployment plan

The final deployment target is the institute's existing RS Mess server.

Planned production architecture:

- Next.js application.
- Self-hosted PostgreSQL database.
- Persistent local file storage outside the application release directory, with separate file backups.
- Nginx or the existing institute web-server configuration.
- HTTPS.
- systemd service management.
- SMTP-based email delivery, subject to institute availability.
- Automated database and file backups.

The library application must be integrated without disrupting the existing RS Mess website.

Institute-server configuration and migration will begin only after the necessary administrative access is available.

## 16. Current development status

The following components have been implemented or tested:

- Public catalogue and search interface.
- Book and physical-copy management.
- Member registration and authentication.
- Email verification workflow.
- Librarian approval and member management.
- Borrowing and return workflow.
- Member dashboard and borrowing history.
- Password recovery implementation.
- PostgreSQL database and Prisma migrations.
- Git version control and private GitHub backup.

Completed during the current development and hardening work:

- Password recovery implementation and token handling.
- Book reviews and book-cover upload verification.
- Authentication rate limiting and request-body size limits.
- Same-origin protection on state-changing API routes.
- Database backup and a test restoration, with table counts checked against the source database.
- Removal of the Supabase SDK and legacy client from the active codebase.
- TypeScript check and production build after Supabase removal.

Remaining work includes:

- Configure and test actual SMTP email delivery.
- Implement automatic due-date and overdue reminders, including a scheduled job.
- Complete the remaining security and reliability review.
- Finalize production configuration, including persistent upload storage, production environment variables, database-role separation, logging, and deployment/rollback procedures.
- Prepare and perform migration to the institute server after administrative access is granted.
- Verify the live deployment and complete handover documentation.

---

**Project:** RS Hostel Library Management System
**Repository:** `Debabrata-py/rs-hostel-library`
**Primary branch:** `main`
**Development environment:** Ubuntu Linux
**Production target:** Institute server (`rsmess.isical.ac.in`)

**README last updated:** 6 November 2026

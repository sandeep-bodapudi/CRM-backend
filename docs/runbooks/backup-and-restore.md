# Backup and restore

Set up on 2 Nov 2026 (architecture review #15).

## Targets

- **Data loss:** at most 1 day (a backup runs every night).
- **Recovery time:** about 2 hours from "database lost" to "CRM working".

## What is backed up

| What                                | How often              | Where                                                                                      | Kept                            |
| ----------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------ | ------------------------------- |
| CRM database (`u988844918_CRM_API`) | Every night, 02:30 IST | Hostinger: `domains/radharealhomeproperties.com/monitor/backups/crm-YYYY-MM-DD.sql.gz.enc` | 30 days                         |
| CRM database, off-site copy         | Every night            | E-mailed to the address in `monitor/backup-email.txt`                                      | As long as the mailbox keeps it |
| Website uploads (photos, proofs)    | Sundays                | `monitor/backups/uploads-YYYY-MM-DD.tar.gz.enc`                                            | 4 weeks                         |
| Hostinger's own backups             | Daily (Hostinger)      | hPanel → Files → Backups                                                                   | Hostinger's plan limit          |
| Code                                | Every push             | GitHub (CRM repo; website repos)                                                           | Always                          |

Every file is encrypted with the passphrase in `monitor/backup-pass.txt`. **Keep a copy of that passphrase outside Hostinger** (password manager). Without it, no backup can be opened.

The uptime check alerts when the last good backup is more than 26 hours old.

## One-time setup (owner)

In hPanel → File Manager, folder `domains/radharealhomeproperties.com/monitor/`:

1. Create `backup.cnf`:
   ```
   [client]
   host=localhost
   user=<database user>
   password=<database password>

   [backup]
   database=u988844918_CRM_API
   ```
2. Create `backup-pass.txt` with a long random passphrase, and save the same passphrase in your password manager.
3. Optional: create `backup-email.txt` with the e-mail address that should receive the nightly copy.

When the database password changes, update `backup.cnf` too.

## Restore

1. Download the backup file you need from `monitor/backups/`, or take it from the e-mail.
2. Decrypt and unpack it on a computer that has `openssl` (Git Bash on Windows has it):
   ```bash
   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass pass:'<passphrase>' -in crm-2026-11-03.sql.gz.enc | gunzip > crm.sql
   ```
3. Load it:
   - **Test first, into the local copy:** in phpMyAdmin or the XAMPP shell, `mysql -u root rrh_restore_test < crm.sql`.
   - **Production:** in hPanel, create an empty database (or empty the broken one), then import `crm.sql` with phpMyAdmin → Import. Point `DATABASE_URL` in Render at it if the name changed.
4. Open the CRM, sign in, and check the latest leads and payments are there.

## Monthly restore test (5 minutes)

Once a month, restore the newest backup into a local database (step 3, "Test first") and check row counts look right, for example `SELECT COUNT(*) FROM Lead;`. Write one line in the log below.

| Date | Backup file | Result | By  |
| ---- | ----------- | ------ | --- |
|      |             |        |     |

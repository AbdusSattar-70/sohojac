#!/usr/bin/env bash
# One-time interactive bootstrap directly into remote Cloudflare D1.
# Credentials are never stored in GitHub, .env, files, or shell history.
set -euo pipefail

if [[ ! -t 0 ]]; then
  echo "Run this script interactively in your local terminal (not GitHub Actions)." >&2
  exit 1
fi

DB="d6f3e4e9-2190-43bf-bc90-969687f6db78"
cd "$(dirname "$0")/.."

echo "Sohojac — first owner setup in existing Cloudflare D1"
echo "Database: sohojac ($DB)"
echo "No GitHub secret or public signup is used for owner credentials."
echo

read -r -p "Owner email (an inbox you control): " owner_email
read -r -p "Owner display name [Sohojac Owner]: " owner_name
owner_name="${owner_name:-Sohojac Owner}"

read -r -s -p "Choose a strong owner password (8–128 characters): " owner_password
printf '\n'
read -r -s -p "Confirm password: " owner_confirmation
printf '\n'

if [[ "$owner_password" != "$owner_confirmation" ]]; then
  echo "Passwords do not match; nothing was changed." >&2
  exit 1
fi
if (( ${#owner_password} < 8 || ${#owner_password} > 128 )); then
  echo "Password must be 8–128 characters; nothing was changed." >&2
  exit 1
fi
unset owner_confirmation

echo
echo "This will apply only pending checked migrations to the EXISTING remote D1,"
echo "then create the first verified OWNER with a Better Auth password hash."
read -r -p "Type CREATE OWNER to continue: " confirmation
if [[ "$confirmation" != "CREATE OWNER" ]]; then
  echo "Cancelled; nothing was changed."
  exit 1
fi

# We never log the password or hash. Do not run with 'bash -x'.
trap 'unset owner_password SOHOJAC_INITIAL_OWNER_PASSWORD SOHOJAC_INITIAL_OWNER_EMAIL SOHOJAC_INITIAL_OWNER_NAME' EXIT
node scripts/check-d1-migrations.mjs
pnpm exec cf d1 migrations list "$DB"
printf 'y\n' | pnpm exec cf d1 migrations apply "$DB"

export SOHOJAC_INITIAL_OWNER_EMAIL="$owner_email"
export SOHOJAC_INITIAL_OWNER_NAME="$owner_name"
export SOHOJAC_INITIAL_OWNER_PASSWORD="$owner_password"
unset owner_password
node scripts/bootstrap-staff-owner.mjs
echo "Owner is in remote D1. You can now sign in at https://sohojac.com/sign-in"

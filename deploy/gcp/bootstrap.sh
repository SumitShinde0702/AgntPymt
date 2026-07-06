#!/usr/bin/env bash

# One-time GCP project bootstrap for AgntPymt MVP.

# Prerequisites: gcloud auth login, billing enabled, PROJECT_ID set.

#

#   export PROJECT_ID=your-gcp-project

#   export REGION=asia-southeast1   # Singapore (default)

#   bash deploy/gcp/bootstrap.sh



set -euo pipefail



PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID}"

REGION="${REGION:-asia-southeast1}"

BUCKET="${PROJECT_ID}-agntpymt-profiles"

REPO="agntpymt"

SQL_INSTANCE="${SQL_INSTANCE:-agntpymt-db}"

DB_NAME="agntpymt"

DB_USER="agntpymt"



echo "==> Enabling APIs…"

gcloud services enable \
  secretmanager.googleapis.com \
  storage.googleapis.com \
  sqladmin.googleapis.com \
  servicenetworking.googleapis.com \
  compute.googleapis.com \
  --project="$PROJECT_ID"

echo "==> GCS profile bucket…"

gsutil mb -p "$PROJECT_ID" -l "$REGION" "gs://${BUCKET}/" 2>/dev/null || true

gsutil uniformbucketlevelaccess set on "gs://${BUCKET}/" 2>/dev/null || true



echo "==> Cloud SQL (PostgreSQL 15, ${REGION})…"

if ! gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT_ID" &>/dev/null; then

  ROOT_PASS="$(openssl rand -base64 18)"

  gcloud sql instances create "$SQL_INSTANCE" \

    --database-version=POSTGRES_15 \

    --tier=db-f1-micro \

    --region="$REGION" \

    --storage-auto-increase \

    --root-password="$ROOT_PASS" \

    --project="$PROJECT_ID"

  echo "  Created instance $SQL_INSTANCE (root password shown once — store safely if needed)"

else

  echo "  Instance $SQL_INSTANCE already exists"

fi



gcloud sql databases create "$DB_NAME" --instance="$SQL_INSTANCE" --project="$PROJECT_ID" 2>/dev/null || true



DB_PASS="$(openssl rand -base64 18)"

if gcloud sql users list --instance="$SQL_INSTANCE" --project="$PROJECT_ID" --format='value(name)' | grep -qx "$DB_USER"; then

  gcloud sql users set-password "$DB_USER" --instance="$SQL_INSTANCE" --password="$DB_PASS" --project="$PROJECT_ID"

else

  gcloud sql users create "$DB_USER" --instance="$SQL_INSTANCE" --password="$DB_PASS" --project="$PROJECT_ID"

fi



CONN_NAME="${PROJECT_ID}:${REGION}:${SQL_INSTANCE}"

DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@/${DB_NAME}?host=/cloudsql/${CONN_NAME}"



echo "==> Secret placeholders…"

create_secret() {

  local name=$1 val=$2

  if gcloud secrets describe "$name" --project="$PROJECT_ID" &>/dev/null; then

    echo "  updating $name"

    printf '%s' "$val" | gcloud secrets versions add "$name" --data-file=- --project="$PROJECT_ID"

  else

    printf '%s' "$val" | gcloud secrets create "$name" --data-file=- --project="$PROJECT_ID"

    echo "  created $name"

  fi

}



create_secret agntpymt-database-url "$DATABASE_URL"

create_secret agntpymt-clerk-secret "sk_test_CHANGE_ME"

create_secret agntpymt-hermes-api-key "change-me-prod"

create_secret agntpymt-mcp-key "$(openssl rand -hex 16)"

create_secret agntpymt-openai-key " "



echo "==> IAM: VM default SA → Cloud SQL + GCS…"

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')

CR_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \

  --member="serviceAccount:${CR_SA}" \

  --role="roles/cloudsql.client" \

  --quiet >/dev/null

gsutil iam ch "serviceAccount:${CR_SA}:objectAdmin" "gs://${BUCKET}"



echo ""

echo "Bootstrap done."

echo "  Region:          $REGION"

echo "  Cloud SQL:       $SQL_INSTANCE ($CONN_NAME)"

echo "  Profile bucket:  gs://${BUCKET}"

echo ""

echo "Deploy the app on your VM:"
echo "  cd /opt/agntpymt && git pull && bash deploy/vm/deploy.sh"



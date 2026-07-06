# One-time GCP project bootstrap for AgntPymt MVP (Windows PowerShell).
#
# Prerequisites: gcloud auth login, billing enabled
#
#   $env:PROJECT_ID = "your-gcp-project"
#   $env:REGION = "asia-southeast1"
#   .\deploy\gcp\bootstrap.ps1

$ErrorActionPreference = "Stop"

if (-not $env:PROJECT_ID) {
    $env:PROJECT_ID = gcloud config get-value project 2>$null
}
if (-not $env:PROJECT_ID) {
    throw "Set PROJECT_ID: `$env:PROJECT_ID = 'your-gcp-project'"
}

$PROJECT_ID = $env:PROJECT_ID
$REGION = if ($env:REGION) { $env:REGION } else { "asia-southeast1" }
$BUCKET = "$PROJECT_ID-agntpymt-profiles"
$REPO = "agntpymt"
$SQL_INSTANCE = if ($env:SQL_INSTANCE) { $env:SQL_INSTANCE } else { "agntpymt-db" }
$DB_NAME = "agntpymt"
$DB_USER = "agntpymt"

function New-RandomBase64([int]$Bytes = 18) {
    $buf = New-Object byte[] $Bytes
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buf)
    return [Convert]::ToBase64String($buf)
}

function New-RandomHex([int]$Bytes = 16) {
    $buf = New-Object byte[] $Bytes
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buf)
    return ([BitConverter]::ToString($buf) -replace "-", "").ToLower()
}

function Invoke-GcloudQuiet([string[]]$GcloudArgs) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & gcloud @GcloudArgs 2>$null | Out-Null
    $ErrorActionPreference = $prev
}

function Set-Secret([string]$Name, [string]$Value) {
    $exists = $true
    try {
        gcloud secrets describe $Name --project=$PROJECT_ID 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) { $exists = $false }
    } catch {
        $exists = $false
    }

    if ($exists) {
        Write-Host "  updating $Name"
        $Value | gcloud secrets versions add $Name --data-file=- --project=$PROJECT_ID
    } else {
        $Value | gcloud secrets create $Name --data-file=- --project=$PROJECT_ID
        Write-Host "  created $Name"
    }
}

Write-Host "==> Enabling APIs..."
gcloud services enable `
    secretmanager.googleapis.com `
    storage.googleapis.com `
    sqladmin.googleapis.com `
    servicenetworking.googleapis.com `
    compute.googleapis.com `
    --project=$PROJECT_ID

Write-Host "==> GCS profile bucket..."
Invoke-GcloudQuiet @("storage", "buckets", "create", "gs://$BUCKET/", "-p", $PROJECT_ID, "-l", $REGION)
Invoke-GcloudQuiet @("storage", "buckets", "update", "gs://$BUCKET/", "--uniform-bucket-level-access")

Write-Host "==> Cloud SQL (PostgreSQL 15, $REGION)..."
$sqlExists = $false
try {
    gcloud sql instances describe $SQL_INSTANCE --project=$PROJECT_ID 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $sqlExists = $true }
} catch {}

if (-not $sqlExists) {
    $ROOT_PASS = New-RandomBase64
    gcloud sql instances create $SQL_INSTANCE `
        --database-version=POSTGRES_15 `
        --tier=db-f1-micro `
        --region=$REGION `
        --storage-auto-increase `
        --root-password=$ROOT_PASS `
        --project=$PROJECT_ID
    Write-Host "  Created instance $SQL_INSTANCE (root password shown once - store safely if needed)"
} else {
    Write-Host "  Instance $SQL_INSTANCE already exists"
}

Invoke-GcloudQuiet @("sql", "databases", "create", $DB_NAME, "--instance=$SQL_INSTANCE", "--project=$PROJECT_ID")

$DB_PASS = New-RandomBase64
$users = gcloud sql users list --instance=$SQL_INSTANCE --project=$PROJECT_ID --format="value(name)"
if ($users -contains $DB_USER) {
    gcloud sql users set-password $DB_USER --instance=$SQL_INSTANCE --password=$DB_PASS --project=$PROJECT_ID
} else {
    gcloud sql users create $DB_USER --instance=$SQL_INSTANCE --password=$DB_PASS --project=$PROJECT_ID
}

$CONN_NAME = "${PROJECT_ID}:${REGION}:${SQL_INSTANCE}"
$DATABASE_URL = "postgresql://${DB_USER}:${DB_PASS}@/${DB_NAME}?host=/cloudsql/${CONN_NAME}"

Write-Host "==> Secret placeholders..."
Set-Secret "agntpymt-database-url" $DATABASE_URL
Set-Secret "agntpymt-clerk-secret" "sk_test_CHANGE_ME"
Set-Secret "agntpymt-hermes-api-key" "change-me-prod"
Set-Secret "agntpymt-mcp-key" (New-RandomHex)
Set-Secret "agntpymt-openai-key" " "

Write-Host "==> IAM: VM default SA -> Cloud SQL + GCS..."
$PROJECT_NUMBER = gcloud projects describe $PROJECT_ID --format="value(projectNumber)"
$CR_SA = "${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud projects add-iam-policy-binding $PROJECT_ID `
    --member="serviceAccount:${CR_SA}" `
    --role="roles/cloudsql.client" `
    --quiet | Out-Null

gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" `
    --member="serviceAccount:${CR_SA}" `
    --role="roles/storage.objectAdmin" `
    --quiet | Out-Null

Write-Host ""
Write-Host "Bootstrap done."
Write-Host "  Region:          $REGION"
Write-Host "  Cloud SQL:       $SQL_INSTANCE ($CONN_NAME)"
Write-Host "  Profile bucket:  gs://$BUCKET"
Write-Host ""
Write-Host "Deploy the app on your VM:"
Write-Host "  cd /opt/agntpymt && git pull && bash deploy/vm/deploy.sh"

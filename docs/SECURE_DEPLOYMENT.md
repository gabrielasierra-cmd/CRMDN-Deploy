# Secure Deploy Checklist

Use tokens and environment variables. Do not paste secrets into files.

## GitHub

Authenticate GitHub CLI with a PAT:

```powershell
$env:GITHUB_PAT | gh auth login --with-token
gh auth setup-git
gh auth status
```

## Supabase

Login with a Supabase access token:

```powershell
$env:SUPABASE_ACCESS_TOKEN | supabase login --token
supabase link --project-ref $env:SUPABASE_PROJECT_REF
```

## Render

Authenticate the CLI and validate the blueprint:

```powershell
render login
render blueprints validate render.yaml
```

For automation, prefer `RENDER_API_KEY` in the environment instead of interactive login.

## Local seed

Apply the official client seed to the shared workspace:

```powershell
cd backend
npm run db:seed:clients
```

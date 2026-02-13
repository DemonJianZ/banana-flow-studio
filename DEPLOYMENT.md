# banana-flow-studio Deployment

## Branch model
- `dev`: development/testing environment
- `main`: production environment

## One-time bootstrap on server
Run from repository root:

```bash
chmod +x scripts/bootstrap_server.sh deploy_dev.sh deploy_prod.sh rollback_prod.sh
./scripts/bootstrap_server.sh
```

If auto-detection fails, provide:

```bash
REPO_PATH=/path/to/banana-flow-studio ./scripts/bootstrap_server.sh
```

## Daily flow
1. Develop and test on `dev`.
2. Deploy test env:

```bash
cd /srv/banana-flow-studio-dev
./deploy_dev.sh
```

3. Merge to `main` and push:

```bash
git checkout main
git merge dev
git push origin main
```

4. Deploy prod:

```bash
cd /srv/banana-flow-studio-prod
./deploy_prod.sh
```

5. Rollback prod to previous commit:

```bash
cd /srv/banana-flow-studio-prod
./rollback_prod.sh
```

## Services and logs
- `banana-flow-studio-dev` (port `8083`)
- `banana-flow-studio-prod` (port `8082`)

```bash
sudo systemctl status banana-flow-studio-dev
sudo systemctl status banana-flow-studio-prod
journalctl -u banana-flow-studio-prod -f
```

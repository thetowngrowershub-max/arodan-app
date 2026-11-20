#!/bin/sh
# Daily database backup, keeping the last 14. Add to cron on the server:
#   0 3 * * * cd ~/arodan-app && ./scripts/backup.sh >> ~/backups/backup.log 2>&1
set -e
mkdir -p ~/backups
docker compose exec -T db pg_dump -U arodan arodan | gzip > ~/backups/arodan-$(date +%F).sql.gz
ls -1t ~/backups/arodan-*.sql.gz | tail -n +15 | xargs -r rm --
echo "$(date) backup ok"

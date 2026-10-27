# Yedekleme konteyneri (karar #103): pg_dump (PostgreSQL 17) + rclone + age, busybox cron.
FROM postgres:17-alpine
RUN apk add --no-cache rclone age tzdata
COPY backup.sh restore.sh /usr/local/bin/
COPY crontab /etc/crontabs/root
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore.sh
# Cron ön planda; işlerin çıktısı konteyner loguna gider
CMD ["crond", "-f", "-l", "8"]

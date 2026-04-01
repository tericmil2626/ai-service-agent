#!/bin/bash
# Database Backup Script for Service Business
# Runs daily via cron, backs up SQLite DB with timestamp

set -e

# Configuration
DB_PATH="/opt/service-business/data/service-business.db"
BACKUP_DIR="/opt/service-business/backups"
RETENTION_DAYS=7
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="service-business_${DATE}.db"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
    echo "Error: Database not found at $DB_PATH"
    exit 1
fi

# Create backup
echo "Creating backup: $BACKUP_FILE"
sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/$BACKUP_FILE'"

# Compress backup
gzip "$BACKUP_DIR/$BACKUP_FILE"
echo "Backup created: $BACKUP_DIR/${BACKUP_FILE}.gz"

# Clean up old backups (older than RETENTION_DAYS)
echo "Cleaning up backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "service-business_*.db.gz" -mtime +$RETENTION_DAYS -delete

# List remaining backups
echo "Current backups:"
ls -lh "$BACKUP_DIR"/*.gz 2>/dev/null || echo "No backups found"

echo "Backup completed successfully!"

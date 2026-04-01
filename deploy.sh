#!/bin/bash
#
# Deploy Service Business Voice Agent to DigitalOcean
#
# Usage: ./deploy.sh

set -e

echo "=========================================="
echo "Service Business Voice Agent Deployment"
echo "=========================================="
echo ""

# Configuration
SERVER_IP="45.55.60.22"
SERVER_USER="theodorosai26"
REMOTE_DIR="/opt/service-business"
LOCAL_DIR="$(pwd)"

echo "Step 1: Building TypeScript..."
npm run build
echo "✓ Build complete"
echo ""

echo "Step 2: Deploying to server..."
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='.env' \
  --exclude='.git' \
  --exclude='audio-cache' \
  --exclude='*.log' \
  "$LOCAL_DIR/dist/" \
  "$SERVER_USER@$SERVER_IP:$REMOTE_DIR/dist/"

echo "✓ Files deployed"
echo ""

echo "Step 3: Restarting service..."
ssh "$SERVER_USER@$SERVER_IP" "cd $REMOTE_DIR && pm2 restart service-business || pm2 start dist/api-v2.js --name service-business"
echo "✓ Service restarted"
echo ""

echo "Step 4: Checking health..."
sleep 2
curl -s "http://$SERVER_IP:3002/health" | jq . || echo "Health check failed"
echo ""

echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "Test the voice agent:"
echo "  Call: +1 (405) 369-4926"
echo ""

#!/bin/bash
#
# Fix SSH access to DigitalOcean server
#
# Run this to copy your SSH key to the server

SERVER_IP="45.55.60.22"
SERVER_USER="theodorosai26"

echo "Copying SSH key to server..."
echo "You'll need to enter your server password when prompted"
echo ""

ssh-copy-id "$SERVER_USER@$SERVER_IP"

echo ""
echo "Testing connection..."
ssh "$SERVER_USER@$SERVER_IP" "echo 'SSH key installed successfully!'"

echo ""
echo "Now you can run ./deploy.sh without password prompts"

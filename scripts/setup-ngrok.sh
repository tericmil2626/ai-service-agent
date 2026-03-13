#!/bin/bash

# ngrok setup script for Service Business AI Receptionist

echo "Setting up ngrok for local Twilio testing..."

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo "ngrok not found. Installing..."
    
    # Download ngrok (Linux x64)
    curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null
    echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list
    sudo apt update && sudo apt install ngrok
    
    echo "ngrok installed."
fi

# Check if authtoken is set
if ! ngrok config check 2>/dev/null | grep -q "authtoken"; then
    echo ""
    echo "You need to set up your ngrok authtoken."
    echo "1. Sign up at https://dashboard.ngrok.com/signup"
    echo "2. Get your authtoken from https://dashboard.ngrok.com/get-started/your-authtoken"
    echo "3. Run: ngrok config add-authtoken YOUR_TOKEN"
    echo ""
    read -p "Press Enter after you've set up your authtoken..."
fi

echo ""
echo "Starting ngrok tunnel to port 3002..."
echo ""
echo "Once running, copy the HTTPS URL and set it in Twilio:"
echo "  Phone Numbers > Manage > Active numbers > Your number > Messaging"
echo "  Set webhook to: https://YOUR_NGROK_URL/webhook/sms"
echo ""

ngrok http 3002

#!/bin/bash
#
# Alternative deployment - use this in DigitalOcean console
# This pulls files from your local machine via a temporary transfer

# Option 1: If you have a web server or can use transfer.sh
# Upload dist folder to transfer.sh first, then download on server

echo "Since SSH is key-only, here are your options:"
echo ""
echo "Option 1: Use transfer.sh (temporary file hosting)"
echo "  On local machine: tar czf dist.tar.gz dist/"
echo "  Then: curl --upload-file dist.tar.gz https://transfer.sh/dist.tar.gz"
echo "  Copy the URL it gives you"
echo "  In DO console: curl -o dist.tar.gz <URL> && tar xzf dist.tar.gz"
echo ""
echo "Option 2: GitHub (if you push to a repo)"
echo "  Push code to GitHub"
echo "  In DO console: git pull && npm run build"
echo ""
echo "Option 3: Use DO's file manager (if available)"
echo "  Some DO consoles have a file upload button"
echo ""
echo "Option 4: Reset SSH to allow passwords (temporary)"
echo "  In DO console: sudo nano /etc/ssh/sshd_config"
echo "  Change: PasswordAuthentication no → yes"
echo "  Then: sudo systemctl restart sshd"
echo "  Then scp will work with password"

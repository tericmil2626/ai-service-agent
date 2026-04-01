#!/bin/bash
#
# Fix SSH key on server - run this in DigitalOcean console
#

# First, clear any corrupted entries
> ~/.ssh/authorized_keys

# Now add the key properly - copy this ENTIRE line including the quotes:
echo "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQDmRv58RPw8GogMmjn1yjyxmCy9q4aY5am3T+mibQESSOZ3c/5UVJqP/JeLBwT5a9f/2UxCFLQv70a8L9ezt1z4WuP/iO7uZCXvY7Mwl0ntx2wMsXZZIJBIGVlqdRAYCX6TLr2D/FCfRf0f6Z7Uw6YZKkaI96u7Y3sA4yDmTCSRedaLWJER8goJ8V2YYxOJThAzm+qPIYBfmIqK9Rk9k6H4sfaU1ldsWoVzVm+8na4sXe/nFOTGChtMQwN0PCiKXwUTPKrGCHULUuqu60cw2Q/hiUVze1mSTXCbl6fSgmOfJ3sqpusTseU7tJ2xXEntPsgPZm/frZTXm2uOjBLFupiIGocuAQeOzRDW8t98LL3/zWy6WpXWdYPrEu8p0mn0xh9FOddK7K9ccAhduRzsi1/99FbMrzgaEvcCdWHip3g/RyJ3+ReAU9HgqLCpycvprUm/y/Curs8BUi5ZJC/Bf0870RtHrLvU5BZcfh1enK3QmoLLSN0jDcUTAU30HnutQqjL75D8EzgrdwwpwGRRDJvSaNNdZ+ERYCrHEQwrATNYTBT3IgL8m+2F1mqibpipLNWMcMJk1i1Mvv6YpX+XDMjOJBeOyCE4WUSWz4X/WZMQuO0ruwAD1rMcBXc09dQGDtEkN8IWETv4KXhh4PPB8PqjKek6Pz9gTpspZqucABr1w== THEODOROSAI26@GMAIL.COM" >> ~/.ssh/authorized_keys

# Fix permissions
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
chown -R theodorosai26:theodorosai26 ~/.ssh

echo "Key added. Testing..."
cat ~/.ssh/authorized_keys

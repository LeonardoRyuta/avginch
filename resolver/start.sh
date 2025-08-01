#!/bin/bash

# ICP Fusion+ Resolver Startup Script

echo "Starting ICP Fusion+ Resolver..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Creating .env file from template..."
    cp .env.example .env
    echo "Please configure the .env file with your actual values before running the resolver."
    echo "The resolver will use default/mock values for now."
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d node_modules ]; then
    echo "Installing dependencies..."
    npm install
fi

# Start the resolver
echo "Starting resolver server..."
npm start

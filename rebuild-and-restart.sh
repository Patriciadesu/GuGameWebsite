#!/bin/bash

echo "🔨 Building backend..."
cd /root/GuGame/backend
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Backend built successfully"
else
    echo "❌ Backend build failed"
    exit 1
fi

echo "🔨 Building frontend..."
cd /root/GuGame/frontend
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Frontend built successfully"
    
    echo "📦 Copying files to nginx directory..."
    cp -r dist/* /var/www/gugame/
    echo "✅ Files copied to /var/www/gugame/"
else
    echo "❌ Frontend build failed"
    exit 1
fi

echo "🔄 Restarting services with PM2..."
pm2 restart gugame-backend
pm2 restart gugame-frontend

echo "✅ All services rebuilt and restarted!"
pm2 status

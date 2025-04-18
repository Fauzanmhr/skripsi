# Use the official Node.js image with Alpine Linux
FROM node:22-alpine
LABEL authors="fauzanmhr"

RUN apk --no-cache add \
    curl \
    tzdata \
    rm -rf /var/cache/apk/*

# Set the timezone to Asia/Jakarta
RUN cp /usr/share/zoneinfo/Asia/Jakarta /etc/localtime && \
    echo "Asia/Jakarta" > /etc/timezone

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Command to run the application
CMD ["node", "app.js"]
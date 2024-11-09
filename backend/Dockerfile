# Stage 1: Build the app with dependencies
FROM node:18-alpine AS build

# Install necessary build tools for native modules
RUN apk add --no-cache python3 make g++

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install all dependencies (including devDependencies)
RUN npm install --legacy-peer-deps

# Copy the rest of the application code
COPY . .


# RUN npm run build

# Stage 2: Create the final runtime image
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json from the build stage
COPY package*.json ./

# Install only production dependencies
RUN npm install --only=production --legacy-peer-deps

# Copy application code from the build stage
COPY --from=build /usr/src/app ./

# Ensure the backups directory exists
RUN mkdir -p backups

# Expose the port your app runs on
EXPOSE 3000

# Define environment variables
ENV NODE_ENV=production

# Start the Node.js application
CMD ["node", "server.js"]

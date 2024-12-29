# Use the Node.js LTS image
FROM node:18

# Set the working directory
WORKDIR /app

# Copy only package.json and package-lock.json to leverage caching
COPY ./api-gateway/package*.json ./

# Install dependencies
RUN npm install --silent

# Copy the rest of the application code
COPY ./api-gateway/src ./src

# Copy the shared interfaces code
COPY ./shared-interfaces/src ./shared-interfaces/src

# Use Docker-specific tsconfig for build
COPY ./api-gateway/tsconfig.docker.json ./tsconfig.json

# Copy nodemon.json for development
COPY ./api-gateway/nodemon.docker.json ./nodemon.json

# Create logs directory
RUN mkdir -p /app/logs && chmod 755 /app/logs

# Compile TypeScript to JavaScript
RUN npm run build

# Expose necessary ports
EXPOSE 3000 8080 9229

# Command to start the service
CMD ["npm", "start"]
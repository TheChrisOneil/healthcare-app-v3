# Use the Node.js LTS image
FROM node:18

# Set the working directory
WORKDIR /app

# Copy only package.json and package-lock.json to leverage caching
COPY ./services/aof-service/package*.json ./

# Install dependencies
RUN npm install --silent

# Copy the shared interfaces code
COPY ./shared-interfaces/src ./shared-interfaces/src

# Copy applicaiton code
COPY ./services/aof-service/src ./src

# Use Docker-specific tsconfig for build
COPY services/aof-service/tsconfig.docker.json ./tsconfig.json

# Copy nodemon.json for development
COPY services/aof-service/nodemon.docker.json ./nodemon.json

# Set up logging directory
RUN mkdir -p /app/logs && chmod 755 /app/logs

# Compile TypeScript to JavaScript
RUN npm run build

# Expose necessary ports for microservices communication and debugging
# BE SURE: ports match in the docker-compose.yml and the service's package.json
EXPOSE 3003 9233

# Command to start the service in watch mode
CMD ["npm", "run", "dev:watch"]
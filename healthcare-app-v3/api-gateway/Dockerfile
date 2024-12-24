# Use the Node.js LTS image
FROM node:18

# Set the working directory
WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Compile TypeScript to JavaScript
RUN npm run build

# Expose the ports for REST and WebSocket
EXPOSE 3000 8080

# Command to start the API Gateway
CMD ["npm", "start"]

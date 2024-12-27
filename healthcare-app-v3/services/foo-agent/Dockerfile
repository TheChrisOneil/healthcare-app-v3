# Use the Node.js LTS image
FROM node:18

# Set the working directory
WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install


# Set up logging directory
RUN mkdir -p /app/logs && chmod 755 /app/logs

# Copy the rest of the application code
COPY . .

# Compile TypeScript to JavaScript
RUN npm run build

# Expose any necessary ports (optional)
EXPOSE 3001

# Command to start the service
CMD ["npm", "start"]
